use std::io::Cursor;

use base64::Engine;
use quick_xml::{events::Event, Reader};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::Serialize;

fn basic_auth(username: &str, password: &str) -> Result<HeaderValue, String> {
    let encoded =
        base64::engine::general_purpose::STANDARD.encode(format!("{username}:{password}"));
    HeaderValue::from_str(&format!("Basic {encoded}")).map_err(|error| error.to_string())
}

fn target_url(endpoint: &str, path: &str) -> String {
    format!(
        "{}/{}",
        endpoint.trim_end_matches('/'),
        path.trim_start_matches('/'),
    )
}

fn auth_headers(username: &str, password: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, basic_auth(username, password)?);
    Ok(headers)
}

#[tauri::command]
pub(crate) async fn webdav_probe(
    endpoint: String,
    username: String,
    password: String,
) -> Result<String, String> {
    let response = reqwest::Client::new()
        .request(
            reqwest::Method::from_bytes(b"PROPFIND").map_err(|error| error.to_string())?,
            endpoint,
        )
        .headers(auth_headers(&username, &password)?)
        .header("Depth", "0")
        .body("<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:propname/></d:propfind>")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if response.status().is_success() || response.status().as_u16() == 207 {
        Ok("WebDAV 连接成功".to_string())
    } else {
        Err(format!("WebDAV 返回 HTTP {}", response.status()))
    }
}

#[tauri::command]
pub(crate) async fn webdav_upload(
    endpoint: String,
    username: String,
    password: String,
    path: String,
    content: Vec<u8>,
    content_type: String,
) -> Result<(), String> {
    let mut headers = auth_headers(&username, &password)?;
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_str(&content_type).map_err(|error| error.to_string())?,
    );
    let response = reqwest::Client::new()
        .put(target_url(&endpoint, &path))
        .headers(headers)
        .body(content)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if response.status().is_success()
        || response.status().as_u16() == 201
        || response.status().as_u16() == 204
    {
        Ok(())
    } else {
        Err(format!("WebDAV 上传失败 HTTP {}", response.status()))
    }
}

#[tauri::command]
pub(crate) async fn webdav_download(
    endpoint: String,
    username: String,
    password: String,
    path: String,
) -> Result<Vec<u8>, String> {
    let response = reqwest::Client::new()
        .get(target_url(&endpoint, &path))
        .headers(auth_headers(&username, &password)?)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("WebDAV 下载失败 HTTP {}", response.status()));
    }
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|error| error.to_string())
}

#[derive(Debug, Serialize)]
pub(crate) struct RemoteEntry {
    href: String,
}

#[tauri::command]
pub(crate) async fn webdav_list(
    endpoint: String,
    username: String,
    password: String,
    path: String,
) -> Result<Vec<RemoteEntry>, String> {
    let response = reqwest::Client::new()
        .request(
            reqwest::Method::from_bytes(b"PROPFIND").map_err(|error| error.to_string())?,
            target_url(&endpoint, &path),
        )
        .headers(auth_headers(&username, &password)?)
        .header("Depth", "1")
        .body("<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:prop><d:resourcetype/></d:prop></d:propfind>")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() && response.status().as_u16() != 207 {
        return Err(format!("WebDAV 列表失败 HTTP {}", response.status()));
    }
    let body = response.bytes().await.map_err(|error| error.to_string())?;
    let mut reader = Reader::from_reader(Cursor::new(body));
    reader.config_mut().trim_text(true);
    let mut entries = Vec::new();
    let mut buffer = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(element)) if element.name().as_ref().ends_with(b"href") => {
                if let Ok(Event::Text(text)) = reader.read_event_into(&mut buffer) {
                    entries.push(RemoteEntry {
                        href: text
                            .decode()
                            .map_err(|error| error.to_string())?
                            .into_owned(),
                    });
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
