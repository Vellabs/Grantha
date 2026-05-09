use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{Manager, State};
mod research;
use research::{ResearchAgent, KnowledgeGraph};
use serde::{Serialize, Deserialize};

pub struct AppState { pub db: Mutex<Connection>, pub agent: ResearchAgent }

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Node { 
    pub id: String, 
    pub label: String, 
    pub description: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub cached_article: Option<String>,
    pub user_notes: Option<String>
}
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Edge { pub id: String, pub source: String, pub target: String, pub label: Option<String> }
#[derive(Serialize, Deserialize, Debug)]
pub struct GraphData { pub nodes: Vec<Node>, pub edges: Vec<Edge> }

impl From<KnowledgeGraph> for GraphData {
    fn from(kg: KnowledgeGraph) -> Self {
        let mut nodes = Vec::new(); let mut edges = Vec::new();
        for item in kg.items {
            nodes.push(Node { 
                id: item.id.clone(), 
                label: item.label, 
                description: item.description,
                x: None,
                y: None,
                cached_article: None,
                user_notes: None
            });
            if let Some(p) = item.parent_id {
                edges.push(Edge { id: format!("{}_{}", p, item.id), source: p, target: item.id, label: item.relationship });
            }
        }
        GraphData { nodes, edges }
    }
}

#[tauri::command]
async fn perform_research(state: State<'_, AppState>, query: String) -> Result<GraphData, String> {
    let kg = state.agent.from_query(&query).await.map_err(|e| e.to_string())?;
    let data: GraphData = kg.into();
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("INSERT OR IGNORE INTO history (query) VALUES (?)", [&query]).ok();
    for n in &data.nodes { 
        conn.execute("INSERT OR REPLACE INTO nodes (id, label, desc, query, x, y) VALUES (?,?,?,?,?,?)", 
            rusqlite::params![&n.id, &n.label, &n.description.clone().unwrap_or_default(), &query, n.x, n.y]).ok(); 
    }
    for e in &data.edges { 
        conn.execute("INSERT OR REPLACE INTO edges VALUES (?,?,?,?,?)", [&e.id, &e.source, &e.target, &e.label.clone().unwrap_or_default(), &query]).ok(); 
    }
    Ok(data)
}

#[tauri::command]
async fn deep_dive_node(state: State<'_, AppState>, topic: String, context: String, query: String, parent_id: String) -> Result<GraphData, String> {
    let kg = state.agent.deep_dive(&topic, &context, &query, &parent_id).await.map_err(|e| e.to_string())?;
    let data: GraphData = kg.into();
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    for n in &data.nodes { 
        conn.execute("INSERT OR REPLACE INTO nodes (id, label, desc, query, x, y) VALUES (?,?,?,?,?,?)", 
            rusqlite::params![&n.id, &n.label, &n.description.clone().unwrap_or_default(), &query, n.x, n.y]).ok(); 
    }
    for e in &data.edges { 
        conn.execute("INSERT OR REPLACE INTO edges VALUES (?,?,?,?,?)", [&e.id, &e.source, &e.target, &e.label.clone().unwrap_or_default(), &query]).ok(); 
    }
    Ok(data)
}

#[tauri::command]
fn delete_search_history(state: State<AppState>, query: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM nodes WHERE query = ?", [&query]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM edges WHERE query = ?", [&query]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM history WHERE query = ?", [&query]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn generate_article(
    state: State<'_, AppState>, 
    id: String, 
    query: String,
    topic: String, 
    _description: String, 
    _parent_id: Option<String>, 
    refresh: bool
) -> Result<String, String> {
    if !refresh {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let mut s = conn.prepare("SELECT cached_article FROM nodes WHERE id = ? AND query = ?").map_err(|e| e.to_string())?;
        if let Ok(Some(cached)) = s.query_row([&id, &query], |r| r.get::<_, Option<String>>(0)) {
            return Ok(cached);
        }
    }
    
    let article = state.agent.render_topic(&topic).await.map_err(|e| e.to_string())?;
    
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE nodes SET cached_article = ? WHERE id = ? AND query = ?", rusqlite::params![&article, &id, &query]).map_err(|e| e.to_string())?;
    
    Ok(article)
}

#[tauri::command]
fn save_node_notes(state: State<AppState>, id: String, query: String, notes: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE nodes SET user_notes = ? WHERE id = ? AND query = ?", rusqlite::params![&notes, &id, &query]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_search_history(state: State<AppState>) -> Result<Vec<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut s = conn.prepare("SELECT query FROM history ORDER BY ts DESC").map_err(|e| e.to_string())?;
    let list: Vec<String> = s.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    Ok(list)
}

#[tauri::command]
fn load_full_graph(state: State<AppState>, query: String) -> Result<GraphData, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut sn = conn.prepare("SELECT id, label, desc, x, y, cached_article, user_notes FROM nodes WHERE query = ?").map_err(|e| e.to_string())?;
    let nodes: Vec<Node> = sn.query_map([&query], |r| Ok(Node { 
        id: r.get(0)?, 
        label: r.get(1)?, 
        description: r.get(2)?,
        x: r.get(3)?,
        y: r.get(4)?,
        cached_article: r.get(5)?,
        user_notes: r.get(6)?
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    let mut se = conn.prepare("SELECT source, target, label FROM edges WHERE query = ?").map_err(|e| e.to_string())?;
    let edges: Vec<Edge> = se.query_map([&query], |e| Ok(Edge { id: format!("{}_{}", e.get::<_,String>(0)?, e.get::<_,String>(1)?), source: e.get(0)?, target: e.get(1)?, label: e.get(2)? })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    Ok(GraphData { nodes, edges })
}

#[tauri::command]
fn update_node_positions(state: State<AppState>, query: String, nodes: Vec<Node>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    for n in nodes {
        conn.execute(
            "UPDATE nodes SET x = ?, y = ? WHERE id = ? AND query = ?",
            rusqlite::params![n.x, n.y, n.id, query],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let p = app.path().app_data_dir().map_err(|e| e.to_string())?.join("g.db");
            std::fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
            let c = Connection::open(p).map_err(|e| e.to_string())?;
            
            // Comprehensive migration check
            let table_info = c.prepare("PRAGMA table_info(nodes)").map_err(|e| e.to_string())?
                .query_map([], |r| r.get::<_, String>(1))
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect::<Vec<String>>();

            let has_query = table_info.contains(&"query".to_string());
            let has_x = table_info.contains(&"x".to_string());
            let has_cached = table_info.contains(&"cached_article".to_string());
            let has_notes = table_info.contains(&"user_notes".to_string());

            if !has_query || !has_x || !has_cached || !has_notes {
                c.execute("DROP TABLE IF EXISTS nodes", []).ok();
                c.execute("DROP TABLE IF EXISTS edges", []).ok();
                c.execute("DROP TABLE IF EXISTS history", []).ok();
            }

            c.execute("CREATE TABLE IF NOT EXISTS nodes (id TEXT, label TEXT, desc TEXT, query TEXT, x REAL, y REAL, cached_article TEXT, user_notes TEXT, PRIMARY KEY(id, query))", []).map_err(|e| e.to_string())?;
            c.execute("CREATE TABLE IF NOT EXISTS edges (id TEXT, source TEXT, target TEXT, label TEXT, query TEXT, PRIMARY KEY(id, query))", []).map_err(|e| e.to_string())?;
            c.execute("CREATE TABLE IF NOT EXISTS history (query TEXT PRIMARY KEY, ts DATETIME DEFAULT CURRENT_TIMESTAMP)", []).map_err(|e| e.to_string())?;
            
            app.manage(AppState { db: Mutex::new(c), agent: ResearchAgent::new() });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            perform_research, 
            generate_article, 
            get_search_history, 
            load_full_graph,
            deep_dive_node,
            delete_search_history,
            update_node_positions,
            save_node_notes
        ])
        .run(tauri::generate_context!())
        .expect("err");
}
