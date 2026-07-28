use std::{collections::HashSet, fs, path::PathBuf};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PendingOperation {
    operation_json: String,
    op_id: String,
    device_id: String,
    sequence: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DatabaseMaintenanceReport {
    operations_before: i64,
    operations_after: i64,
    compacted_operations: i64,
    database_bytes_before: u64,
    database_bytes_after: u64,
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("notebook.sqlite3"))
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let connection = Connection::open(database_path(app)?).map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS workspace_state (id INTEGER PRIMARY KEY CHECK (id = 1), state_json TEXT NOT NULL, updated_at INTEGER NOT NULL);\
             CREATE TABLE IF NOT EXISTS operations (op_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, sequence INTEGER NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL);\
             CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, local_path TEXT, remote_path TEXT, pinned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);",
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

#[tauri::command]
pub(crate) fn load_workspace(app: AppHandle) -> Result<Option<String>, String> {
    let connection = open_database(&app)?;
    let mut statement = connection
        .prepare("SELECT state_json FROM workspace_state WHERE id = 1")
        .map_err(|error| error.to_string())?;
    match statement.query_row([], |row| row.get::<_, String>(0)) {
        Ok(json) => Ok(Some(json)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub(crate) fn save_workspace(app: AppHandle, state_json: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute(
            "INSERT INTO workspace_state (id, state_json, updated_at) VALUES (1, ?1, unixepoch()) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at",
            params![state_json],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) fn append_operation(
    app: AppHandle,
    operation_json: String,
    op_id: String,
    device_id: String,
    sequence: i64,
) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute(
            "INSERT OR IGNORE INTO operations (op_id, device_id, sequence, payload, created_at) VALUES (?1, ?2, ?3, ?4, unixepoch())",
            params![op_id, device_id, sequence, operation_json],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) fn save_workspace_batch(
    app: AppHandle,
    state_json: String,
    operations: Vec<PendingOperation>,
) -> Result<(), String> {
    let mut connection = open_database(&app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO workspace_state (id, state_json, updated_at) VALUES (1, ?1, unixepoch()) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at",
            params![state_json],
        )
        .map_err(|error| error.to_string())?;
    for operation in operations {
        transaction
            .execute(
                "INSERT OR IGNORE INTO operations (op_id, device_id, sequence, payload, created_at) VALUES (?1, ?2, ?3, ?4, unixepoch())",
                params![
                    operation.op_id,
                    operation.device_id,
                    operation.sequence,
                    operation.operation_json
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) fn maintain_database(app: AppHandle) -> Result<DatabaseMaintenanceReport, String> {
    let path = database_path(&app)?;
    let database_bytes_before = fs::metadata(&path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let mut connection = open_database(&app)?;
    let operations_before = connection
        .query_row("SELECT COUNT(*) FROM operations", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| error.to_string())?;

    let redundant_ids = {
        let mut statement = connection
            .prepare("SELECT op_id, device_id, payload FROM operations ORDER BY device_id, sequence DESC, rowid DESC")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|error| error.to_string())?;
        let mut latest_markdown_entities = HashSet::new();
        let mut redundant_ids = Vec::new();
        for row in rows {
            let (op_id, device_id, payload) = row.map_err(|error| error.to_string())?;
            let Ok(operation) = serde_json::from_str::<serde_json::Value>(&payload) else {
                continue;
            };
            if operation.get("kind").and_then(|value| value.as_str()) != Some("update_markdown") {
                continue;
            }
            let Some(entity_id) = operation.get("entityId").and_then(|value| value.as_str()) else {
                continue;
            };
            if !latest_markdown_entities.insert((device_id, entity_id.to_string())) {
                redundant_ids.push(op_id);
            }
        }
        redundant_ids
    };

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    for op_id in &redundant_ids {
        transaction
            .execute("DELETE FROM operations WHERE op_id = ?1", params![op_id])
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    connection
        .execute_batch("PRAGMA optimize; VACUUM;")
        .map_err(|error| error.to_string())?;
    let operations_after = operations_before - redundant_ids.len() as i64;
    drop(connection);
    let database_bytes_after = fs::metadata(path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);

    Ok(DatabaseMaintenanceReport {
        operations_before,
        operations_after,
        compacted_operations: redundant_ids.len() as i64,
        database_bytes_before,
        database_bytes_after,
    })
}
