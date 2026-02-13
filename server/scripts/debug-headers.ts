import { parse } from 'csv-parse/sync';
import axios from 'axios';

// Your Google Script URL
const FEED_URL = "https://script.google.com/macros/s/AKfycbz3oZNoHGZUij1QcT9hRglwwFE1KbRGqlsbeYQK_m4EKiD6gUzXkGIc9vKEG4xALfwB/exec";

async function checkHeaders() {
  console.log("Fetching CSV...");
  try {
    const response = await axios.get(FEED_URL);
    const csvContent = response.data;
    
    // Parse just the first line to get headers
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      to: 1 // Only parse first row
    });

    if (records.length > 0) {
      console.log("\n✅ SUCCESS: CSV Downloaded.");
      console.log("Here are the EXACT headers found in the file:");
      console.log(Object.keys(records[0]));
      
      console.log("\nChecking for 'customized-url'...");
      const keys = Object.keys(records[0]);
      const found = keys.find(k => k.toLowerCase().includes('custom') || k.toLowerCase().includes('url'));
      console.log(`Did we find a match? ${found ? "YES: " + found : "NO"}`);
    } else {
      console.log("⚠️  CSV appears empty.");
    }

  } catch (error) {
    console.error("Error fetching CSV:", error.message);
  }
}

checkHeaders();