mod attachments;
mod credentials;
mod database;
mod webdav;

use attachments::{delete_attachments, read_attachment, save_attachment_from_path};
use credentials::{load_sync_credentials, save_sync_credentials};
use database::{
    append_operation, load_workspace, maintain_database, save_workspace, save_workspace_batch,
};
use webdav::{webdav_download, webdav_list, webdav_probe, webdav_upload};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            save_workspace,
            save_workspace_batch,
            append_operation,
            save_sync_credentials,
            load_sync_credentials,
            webdav_probe,
            webdav_upload,
            webdav_download,
            webdav_list,
            save_attachment_from_path,
            read_attachment,
            delete_attachments,
            maintain_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
