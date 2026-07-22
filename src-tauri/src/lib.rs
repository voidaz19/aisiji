use std::{fs, io::Cursor, path::PathBuf};

use base64::Engine;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use quick_xml::{events::Event, Reader};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

const KEYRING_SERVICE: &str = "com.aisiji.outliner";
const KEYRING_USER: &str = "webdav-credentials";

#[derive(Debug, Serialize, Deserialize)]
struct SyncCredentials {
    endpoint: String,
    username: String,
    password: String,
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("notebook.sqlite3"))
}

fn attachment_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?.join("attachments");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let connection = Connection::open(database_path(app)?).map_err(|error| error.to_string())?;
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS workspace_state (id INTEGER PRIMARY KEY CHECK (id = 1), state_json TEXT NOT NULL, updated_at INTEGER NOT NULL);\
         CREATE TABLE IF NOT EXISTS operations (op_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, sequence INTEGER NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL);\
         CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, local_path TEXT, remote_path TEXT, pinned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);",
    ).map_err(|error| error.to_string())?;
    Ok(connection)
}

#[tauri::command]
fn load_workspace(app: AppHandle) -> Result<Option<String>, String> {
    let connection = open_database(&app)?;
    let mut statement = connection.prepare("SELECT state_json FROM workspace_state WHERE id = 1").map_err(|error| error.to_string())?;
    let value = statement.query_row([], |row| row.get::<_, String>(0));
    match value {
        Ok(json) => Ok(Some(json)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_workspace(app: AppHandle, state_json: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection.execute(
        "INSERT INTO workspace_state (id, state_json, updated_at) VALUES (1, ?1, unixepoch()) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at",
        params![state_json],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn append_operation(app: AppHandle, operation_json: String, op_id: String, device_id: String, sequence: i64) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection.execute(
        "INSERT OR IGNORE INTO operations (op_id, device_id, sequence, payload, created_at) VALUES (?1, ?2, ?3, ?4, unixepoch())",
        params![op_id, device_id, sequence, operation_json],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_sync_credentials(endpoint: String, username: String, password: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|error| error.to_string())?;
    let payload = serde_json::to_string(&SyncCredentials { endpoint, username, password }).map_err(|error| error.to_string())?;
    entry.set_password(&payload).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_sync_credentials() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn basic_auth(username: &str, password: &str) -> Result<HeaderValue, String> {
    let encoded = base64::engine::general_purpose::STANDARD.encode(format!("{username}:{password}"));
    HeaderValue::from_str(&format!("Basic {encoded}")).map_err(|error| error.to_string())
}

#[tauri::command]
async fn webdav_probe(endpoint: String, username: String, password: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, basic_auth(&username, &password)?);
    let response = client.request(reqwest::Method::from_bytes(b"PROPFIND").map_err(|error| error.to_string())?, endpoint)
        .headers(headers)
        .header("Depth", "0")
        .body("<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:propname/></d:propfind>")
        .send().await.map_err(|error| error.to_string())?;
    if response.status().is_success() || response.status().as_u16() == 207 {
        Ok("WebDAV 连接成功".to_string())
    } else {
        Err(format!("WebDAV 返回 HTTP {}", response.status()))
    }
}

#[tauri::command]
async fn webdav_upload(endpoint: String, username: String, password: String, path: String, content: Vec<u8>, content_type: String) -> Result<(), String> {
    let base = endpoint.trim_end_matches('/');
    let target = format!("{base}/{}", path.trim_start_matches('/'));
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, basic_auth(&username, &password)?);
    headers.insert(CONTENT_TYPE, HeaderValue::from_str(&content_type).map_err(|error| error.to_string())?);
    let response = reqwest::Client::new().put(target).headers(headers).body(content).send().await.map_err(|error| error.to_string())?;
    if response.status().is_success() || response.status().as_u16() == 201 || response.status().as_u16() == 204 { Ok(()) } else { Err(format!("WebDAV 上传失败 HTTP {}", response.status())) }
}

#[tauri::command]
async fn webdav_download(endpoint: String, username: String, password: String, path: String) -> Result<Vec<u8>, String> {
    let base = endpoint.trim_end_matches('/');
    let target = format!("{base}/{}", path.trim_start_matches('/'));
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, basic_auth(&username, &password)?);
    let response = reqwest::Client::new().get(target).headers(headers).send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() { return Err(format!("WebDAV 下载失败 HTTP {}", response.status())); }
    response.bytes().await.map(|bytes| bytes.to_vec()).map_err(|error| error.to_string())
}

#[derive(Debug, Serialize)]
struct RemoteEntry { href: String }

#[tauri::command]
async fn webdav_list(endpoint: String, username: String, password: String, path: String) -> Result<Vec<RemoteEntry>, String> {
    let base = endpoint.trim_end_matches('/');
    let target = format!("{base}/{}", path.trim_start_matches('/'));
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, basic_auth(&username, &password)?);
    let response = reqwest::Client::new().request(reqwest::Method::from_bytes(b"PROPFIND").map_err(|error| error.to_string())?, target)
        .headers(headers)
        .header("Depth", "1")
        .body("<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:prop><d:resourcetype/></d:prop></d:propfind>")
        .send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() && response.status().as_u16() != 207 { return Err(format!("WebDAV 列表失败 HTTP {}", response.status())); }
    let body = response.bytes().await.map_err(|error| error.to_string())?;
    let mut reader = Reader::from_reader(Cursor::new(body));
    reader.config_mut().trim_text(true);
    let mut entries = Vec::new();
    let mut buffer = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(element)) if element.name().as_ref().ends_with(b"href") => {
                if let Ok(Event::Text(text)) = reader.read_event_into(&mut buffer) {
                    entries.push(RemoteEntry { href: text.decode().map_err(|error| error.to_string())?.into_owned() });
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(error.to_string()),
            _ => {}
        }
        buffer.clear();
    }
    Ok(entries)
}

#[tauri::command]
fn hash_bytes(content: Vec<u8>) -> String {
    let digest = Sha256::digest(content);
    format!("{digest:x}")
}

#[tauri::command]
fn save_attachment(app: AppHandle, attachment_id: String, content: Vec<u8>) -> Result<String, String> {
    if content.len() > 20 * 1024 * 1024 { return Err("附件超过 20MB 限制".to_string()); }
    let path = attachment_dir(&app)?.join(&attachment_id);
    fs::write(&path, content).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_attachment(app: AppHandle, attachment_id: String) -> Result<Vec<u8>, String> {
    fs::read(attachment_dir(&app)?.join(attachment_id)).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![load_workspace, save_workspace, append_operation, save_sync_credentials, load_sync_credentials, webdav_probe, webdav_upload, webdav_download, webdav_list, hash_bytes, save_attachment, read_attachment])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
