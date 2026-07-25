use std::{fs, path::PathBuf};

use rusqlite::{params, Connection};
use tauri::{AppHandle, Manager};

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
