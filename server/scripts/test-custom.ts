import { processCustomZip } from '../src/amazon-custom';

// Use a real Amazon Custom ZIP URL from one of your reports, 
// OR mock it if you have the file locally.
const TEST_URL = "https://zme-caps.amazon.com/t/u1KvV1EW6Teh/lfjaUYOiGtEhiowuos4jyra9KbQKIR9aa6Ps0VQk3WI/23"; 

async function test() {
  console.log("Testing download and extraction...");
  try {
    const result = await processCustomZip(TEST_URL);
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("Error:", e);
  }
}

test();