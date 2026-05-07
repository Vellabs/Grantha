use serde::{Serialize, Deserialize};
use reqwest::Client;
use std::error::Error;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct KnowledgeItem {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
    pub parent_id: Option<String>,
    pub relationship: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct KnowledgeGraph {
    pub query: String,
    pub items: Vec<KnowledgeItem>,
}

pub struct ResearchAgent {
    client: Client,
    ollama_url: String,
    model: String,
}

impl ResearchAgent {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            ollama_url: "http://localhost:11434/api/generate".to_string(),
            model: "gemma4:31b-cloud".to_string(),
        }
    }

    pub async fn query_ollama(&self, prompt: &str) -> Result<String, Box<dyn Error + Send + Sync>> {
        let response = self.client.post(&self.ollama_url)
            .json(&serde_json::json!({ "model": self.model, "prompt": prompt, "stream": false }))
            .send().await?;
        
        let res: serde_json::Value = response.json().await?;
        if let Some(err) = res.get("error") { return Err(err.to_string().into()); }
        
        Ok(res["response"].as_str().ok_or("Missing response")?.to_string())
    }

    pub async fn from_query(&self, query: &str) -> Result<KnowledgeGraph, Box<dyn Error + Send + Sync>> {
        let prompt = format!(
            "Create a technical tree-structured KnowledgeGraph for: {}. \
             Return ONLY raw JSON: {{\"query\": \"{}\", \"items\": [ \
             {{\"id\": \"id\", \"label\": \"name\", \"description\": \"text\", \"parent_id\": null, \"relationship\": null}} ]}}", 
            query, query
        );
        let response = self.query_ollama(&prompt).await?;
        let json_str = response.trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
        Ok(serde_json::from_str(json_str)?)
    }

    pub async fn deep_dive(&self, topic: &str, context: &str, query: &str, parent_id: &str) -> Result<KnowledgeGraph, Box<dyn Error + Send + Sync>> {
        let prompt = format!(
            "Expand on the topic '{}' (Context: {}) within the field of '{}'. \
             Provide detailed sub-components and related technical concepts. \
             Return ONLY raw JSON in this structure: {{\"query\": \"{}\", \"items\": [ \
             {{\"id\": \"unique_id\", \"label\": \"name\", \"description\": \"text\", \"parent_id\": \"{}\", \"relationship\": \"related to\"}} ]}}", 
            topic, context, query, query, parent_id
        );
        let response = self.query_ollama(&prompt).await?;
        let json_str = response.trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
        Ok(serde_json::from_str(json_str)?)
    }

    pub async fn render_topic(&self, topic: &str) -> Result<String, Box<dyn Error + Send + Sync>> {
        let url = format!("https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles={}&format=json&redirects=1", urlencoding::encode(topic));
        let content = self.client.get(url).header("User-Agent", "Grantha/1.0").send().await?.text().await?;
        self.query_ollama(&format!("Summarize this content about '{}' into a technical article:\n{}", topic, content)).await
    }
}
