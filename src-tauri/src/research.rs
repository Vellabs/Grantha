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

#[derive(Clone)]
pub struct ResearchAgent {
    client: Client,
    pub ollama_url: String,
    pub model: String,
}

impl ResearchAgent {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            ollama_url: "http://localhost:11434/api/generate".to_string(),
            model: "gemma4:31b-cloud".to_string(),
        }
    }

    pub fn set_config(&mut self, url: String, model: String) {
        self.ollama_url = if url.ends_with("/api/generate") {
            url
        } else {
            format!("{}/api/generate", url.trim_end_matches('/'))
        };
        self.model = model;
    }

    pub async fn list_models(url: &str) -> Result<Vec<String>, Box<dyn Error + Send + Sync>> {
        let base_url = url.trim_end_matches('/').trim_end_matches("/api/generate");
        let tags_url = format!("{}/api/tags", base_url);
        
        let client = Client::new();
        let response = client.get(&tags_url).send().await?;
        let res: serde_json::Value = response.json().await?;
        
        let mut models = Vec::new();
        if let Some(models_array) = res["models"].as_array() {
            for m in models_array {
                if let Some(name) = m["name"].as_str() {
                    models.push(name.to_string());
                }
            }
        }
        Ok(models)
    }

    pub async fn query_ollama(client: &Client, url: &str, model: &str, prompt: &str) -> Result<String, Box<dyn Error + Send + Sync>> {
        let response = client.post(url)
            .json(&serde_json::json!({ "model": model, "prompt": prompt, "stream": false }))
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
        Self::query_ollama(&self.client, &self.ollama_url, &self.model, &prompt).await.map(|response| {
            let json_str = response.trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
            serde_json::from_str(json_str).unwrap_or_else(|_| KnowledgeGraph { query: query.to_string(), items: vec![] })
        }).map_err(|e| e)
    }

    pub async fn deep_dive(&self, topic: &str, context: &str, query: &str, parent_id: &str) -> Result<KnowledgeGraph, Box<dyn Error + Send + Sync>> {
        let prompt = format!(
            "Expand on the topic '{}' (Context: {}) within the field of '{}'. \
             Provide detailed sub-components and related technical concepts. \
             Return ONLY raw JSON in this structure: {{\"query\": \"{}\", \"items\": [ \
             {{\"id\": \"unique_id\", \"label\": \"name\", \"description\": \"text\", \"parent_id\": \"{}\", \"relationship\": \"related to\"}} ]}}", 
            topic, context, query, query, parent_id
        );
        Self::query_ollama(&self.client, &self.ollama_url, &self.model, &prompt).await.map(|response| {
            let json_str = response.trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
            serde_json::from_str(json_str).unwrap_or_else(|_| KnowledgeGraph { query: query.to_string(), items: vec![] })
        }).map_err(|e| e)
    }

    pub async fn render_topic(&self, topic: &str) -> Result<String, Box<dyn Error + Send + Sync>> {
        let url = format!("https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles={}&format=json&redirects=1", urlencoding::encode(topic));
        let content = self.client.get(&url).header("User-Agent", "Grantha/1.0").send().await?.text().await?;
        
        let wiki_url = format!("https://en.wikipedia.org/wiki/{}", urlencoding::encode(topic));
        let prompt = format!(
            "Summarize this content about '{}' into a thorough technical article. \
             Use professional tone and structure with markdown headers (## Overview, ## Core Concepts, ## Technical Details). \
             Be comprehensive and explain sub-components. \
             At the end of the article, add a '## Sources' section and list this link: {}.\n\nContent:\n{}", 
            topic, wiki_url, content
        );
        
        Self::query_ollama(&self.client, &self.ollama_url, &self.model, &prompt).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_config() {
        let mut agent = ResearchAgent::new();
        agent.set_config("http://localhost:11434".to_string(), "llama3".to_string());
        assert_eq!(agent.ollama_url, "http://localhost:11434/api/generate");
        assert_eq!(agent.model, "llama3");

        agent.set_config("http://localhost:11434/api/generate".to_string(), "gemma".to_string());
        assert_eq!(agent.ollama_url, "http://localhost:11434/api/generate");
        assert_eq!(agent.model, "gemma");
    }
}
