use std::{fs, path::PathBuf};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

const MAX_ATTACHMENT_SIZE: usize = 20 * 1024 * 1024;

fn attachment_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("attachments");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub(crate) fn hash_bytes(content: Vec<u8>) -> String {
    let digest = Sha256::digest(content);
    format!("{digest:x}")
}

#[tauri::command]
pub(crate) fn save_attachment(
    app: AppHandle,
    attachment_id: String,
    content: Vec<u8>,
) -> Result<String, String> {
    if content.len() > MAX_ATTACHMENT_SIZE {
        return Err("附件超过 20MB 限制".to_string());
    }
    let path = attachment_dir(&app)?.join(&attachment_id);
    fs::write(&path, content).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub(crate) fn read_attachment(app: AppHandle, attachment_id: String) -> Result<Vec<u8>, String> {
    fs::read(attachment_dir(&app)?.join(attachment_id)).map_err(|error| error.to_string())
}
