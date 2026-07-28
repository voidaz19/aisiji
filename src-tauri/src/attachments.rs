use std::{
    fs,
    path::{Component, Path, PathBuf},
};

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

#[tauri::command]
pub(crate) fn delete_attachments(
    app: AppHandle,
    attachment_ids: Vec<String>,
) -> Result<usize, String> {
    let dir = attachment_dir(&app)?;
    let mut deleted = 0;
    for attachment_id in attachment_ids {
        let mut components = Path::new(&attachment_id).components();
        if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
            return Err("无效的附件 ID".to_string());
        }
        let path = dir.join(attachment_id);
        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
            deleted += 1;
        }
    }
    Ok(deleted)
}
