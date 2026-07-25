use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "com.aisiji.outliner";
const KEYRING_USER: &str = "webdav-credentials";

#[derive(Debug, Serialize, Deserialize)]
struct SyncCredentials {
    endpoint: String,
    username: String,
    password: String,
}

#[tauri::command]
pub(crate) fn save_sync_credentials(
    endpoint: String,
    username: String,
    password: String,
) -> Result<(), String> {
    let entry =
        keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|error| error.to_string())?;
    let payload = serde_json::to_string(&SyncCredentials {
        endpoint,
        username,
        password,
    })
    .map_err(|error| error.to_string())?;
    entry
        .set_password(&payload)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn load_sync_credentials() -> Result<Option<String>, String> {
    let entry =
        keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}
