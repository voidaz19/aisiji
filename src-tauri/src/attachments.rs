use std::{
    fs,
    io::{Read, Write},
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredAttachment {
    pub(crate) name: String,
    pub(crate) mime: String,
    pub(crate) size: u64,
    pub(crate) sha256: String,
    pub(crate) local_path: String,
}

#[tauri::command]
pub(crate) fn save_attachment_from_path(
    app: AppHandle,
    attachment_id: String,
    source_path: String,
) -> Result<StoredAttachment, String> {
    let mut id_components = Path::new(&attachment_id).components();
    if !matches!(id_components.next(), Some(Component::Normal(_))) || id_components.next().is_some()
    {
        return Err("无效的附件 ID".to_string());
    }

    let source = PathBuf::from(&source_path);
    let metadata = fs::metadata(&source).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("只能导入文件".to_string());
    }
    if metadata.len() > MAX_ATTACHMENT_SIZE as u64 {
        return Err("附件超过 20MB 限制".to_string());
    }

    let directory = attachment_dir(&app)?;
    let destination = directory.join(&attachment_id);
    let temporary = directory.join(format!("{attachment_id}.tmp"));
    let mut input = fs::File::open(&source).map_err(|error| error.to_string())?;
    let mut output = fs::File::create(&temporary).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut size = 0_u64;

    let result = (|| {
        loop {
            let count = input.read(&mut buffer).map_err(|error| error.to_string())?;
            if count == 0 {
                break;
            }
            size += count as u64;
            if size > MAX_ATTACHMENT_SIZE as u64 {
                return Err("附件超过 20MB 限制".to_string());
            }
            hasher.update(&buffer[..count]);
            output
                .write_all(&buffer[..count])
                .map_err(|error| error.to_string())?;
        }
        output.sync_all().map_err(|error| error.to_string())?;
        fs::rename(&temporary, &destination).map_err(|error| error.to_string())?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }

    let name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("未命名文件")
        .to_string();
    let mime = mime_guess::from_path(&source)
        .first_or_octet_stream()
        .essence_str()
        .to_string();
    Ok(StoredAttachment {
        name,
        mime,
        size,
        sha256: format!("{:x}", hasher.finalize()),
        local_path: destination.to_string_lossy().into_owned(),
    })
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
