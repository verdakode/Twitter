import { TpaSession } from '@augmentos/sdk';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface TwitterProfile {
  username: string;
  description: string;
  posts: {
    date: string;
    content: string;
    link?: string;
  }[];
}

export class TwitterAgent {
  private session: TpaSession;
  
  constructor(session: TpaSession) {
    this.session = session;
  }
  
  /**
   * Get Twitter profile information for a specified username
   * @param username The Twitter username to look up
   * @returns Promise with the profile information text
   */
  public async getProfileInfo(username: string): Promise<TwitterProfile | null> {
    this.session.layouts.showTextWall(`Fetching Twitter profile for ${username}...`);
    
    try {
      const result = await this.runPythonAgent(username);
      console.log("Raw result from Python agent:", result);
      
      // Try to parse the JSON from the result
      try {
        // Extract JSON from the text response
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const jsonStr = jsonMatch[0];
            const data = JSON.parse(jsonStr);
            
            // Extract the relevant information
            const profile: TwitterProfile = {
              username: data.Grok_Chat_Tab?.Username || data["Grok Chat Tab"]?.Username || "Unknown",
              description: data.Grok_Chat_Tab?.Description || data["Grok Chat Tab"]?.Description || "No description available",
              posts: []
            };
            
            // Extract posts
            const posts = data.Grok_Chat_Tab?.Posts || data["Grok Chat Tab"]?.Posts || [];
            profile.posts = posts.map((post: any) => ({
              date: post.Date || "",
              content: post.Content || "",
              link: post.Link || ""
            }));
            
            return profile;
          } catch (jsonError) {
            console.error("JSON parsing error:", jsonError);
            // Fall through to text extraction
          }
        }
        
        // If JSON parsing fails, try to extract information from the text
        console.log("Falling back to text extraction");
        
        // Extract username
        let username = "Unknown";
        const usernameMatch = result.match(/Username: ([^\n]+)/);
        if (usernameMatch) {
          username = usernameMatch[1];
        }
        
        // Extract description
        let description = "No description available";
        const descriptionMatch = result.match(/Description: ([^\n]+)/);
        if (descriptionMatch) {
          description = descriptionMatch[1];
        } else {
          // Try to find any paragraph that might be a description
          const lines = result.split('\n');
          for (const line of lines) {
            if (line.length > 50 && !line.includes('Date:') && !line.includes('Content:')) {
              description = line.trim();
              break;
            }
          }
        }
        
        // Extract posts
        const posts = [];
        const postMatches = result.matchAll(/Date: ([^\n]+)[\s\S]*?Content: ([^\n]+)/g);
        for (const match of postMatches) {
          posts.push({
            date: match[1],
            content: match[2],
            link: ""
          });
        }
        
        // If no posts were found, try to extract any content that looks like posts
        if (posts.length === 0) {
          const lines = result.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/)) {
              posts.push({
                date: line,
                content: lines[i+1]?.trim() || "",
                link: ""
              });
              i++; // Skip the next line
            }
          }
        }
        
        return {
          username,
          description,
          posts: posts.length > 0 ? posts : [{
            date: "N/A",
            content: "No posts found",
            link: ""
          }]
        };
      } catch (parseError) {
        console.error('Error parsing Twitter profile data:', parseError);
        // If all parsing fails, return the raw text
        return {
          username: username,
          description: "Raw profile data",
          posts: [{
            date: "N/A",
            content: result,
            link: ""
          }]
        };
      }
    } catch (error) {
      this.session.layouts.showTextWall(`Error fetching Twitter profile: ${error.message}`);
      console.error('Twitter agent error:', error);
      return null;
    }
  }
  
  /**
   * Runs the Python Twitter agent with the given username
   * @param username The Twitter username to look up
   * @returns Promise with the agent's output
   */
  private runPythonAgent(username: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Sanitize the username to prevent command injection
      const sanitizedUsername = username.replace(/[^a-zA-Z0-9_]/g, '');
      console.log(`[DEBUG] Running Python agent with sanitized username: "${sanitizedUsername}"`);
      
      // Path to the Python script relative to where this code will run
      const pythonScript = path.join(__dirname, 'butwitter', 'agent.py');
      
      // Check if the script exists
      if (!fs.existsSync(pythonScript)) {
        console.error(`[DEBUG] Python script not found at: ${pythonScript}`);
        reject(new Error(`Python script not found at: ${pythonScript}`));
        return;
      }
      
      console.log(`[DEBUG] Running Python script: ${pythonScript}`);
      
      // Try different Python executable names
      const pythonCommands = ['python3', 'python', 'py'];
      let pythonProcess = null;
      let errorOutput = '';
      
      // Try each Python command until one works
      for (const cmd of pythonCommands) {
        try {
          console.log(`[DEBUG] Attempting to run with ${cmd}...`);
          pythonProcess = spawn(cmd, [pythonScript, sanitizedUsername]);
          console.log(`[DEBUG] Spawn successful with ${cmd}`);
          break; // If spawn doesn't throw, we found a working command
        } catch (error) {
          console.log(`[DEBUG] Command ${cmd} failed: ${error.message}`);
          errorOutput += `Failed to run with ${cmd}: ${error.message}\n`;
        }
      }
      
      if (!pythonProcess) {
        console.error("[DEBUG] Could not find Python executable");
        reject(new Error(`Could not find Python executable. Tried: ${pythonCommands.join(', ')}. ${errorOutput}`));
        return;
      }
      
      let output = '';
      
      // Collect stdout data
      pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        console.log(`Python output: ${chunk}`);
        output += chunk;
      });
      
      // Collect stderr data
      pythonProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        console.error(`Python error: ${chunk}`);
        errorOutput += chunk;
      });
      
      // Add a timeout to kill the process if it takes too long
      const processTimeout = setTimeout(() => {
        if (pythonProcess) {
          console.error("[DEBUG] Python process timed out after 120 seconds");
          pythonProcess.kill();
          reject(new Error("Python process timed out after 120 seconds"));
        }
      }, 120000); // 120 second timeout (2 minutes)
      
      // Handle process completion
      pythonProcess.on('close', (code) => {
        clearTimeout(processTimeout); // Clear the timeout
        console.log(`[DEBUG] Python process exited with code ${code}`);
        if (code === 0) {
          resolve(output.trim());
        } else {
          if (errorOutput.includes('No module named')) {
            const missingModule = errorOutput.match(/No module named '([^']+)'/);
            const moduleMessage = missingModule ? missingModule[1] : 'required modules';
            
            const installMessage = `Python module(s) missing. Please run: pip3 install ${moduleMessage}`;
            console.error(installMessage);
            reject(new Error(`${installMessage}\n\nFull error: ${errorOutput}`));
          } else {
            reject(new Error(`Python process exited with code ${code}: ${errorOutput}`));
          }
        }
      });
      
      // Handle process errors
      pythonProcess.on('error', (error) => {
        clearTimeout(processTimeout); // Clear the timeout
        console.error(`[DEBUG] Failed to start Python process: ${error.message}`);
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  }
  
  /**
   * Post a tweet with the specified text
   * @param text The text content to post as a tweet
   * @returns Promise with the result of the posting operation
   */
  public async postTweet(text: string): Promise<{ success: boolean; message: string }> {
    this.session.layouts.showTextWall(`Posting tweet: "${text}"...`);
    
    try {
      const result = await this.runPythonShitposter(text);
      console.log("Raw result from Python shitposter:", result);
      
      return {
        success: true,
        message: `Tweet posted successfully! Response: ${result}`
      };
    } catch (error) {
      this.session.layouts.showTextWall(`Error posting tweet: ${error.message}`);
      console.error('Twitter shitpost error:', error);
      return {
        success: false,
        message: `Failed to post tweet: ${error.message}`
      };
    }
  }
  
  /**
   * Runs the Python shitpost agent with the given text
   * @param text The text to post as a tweet
   * @returns Promise with the agent's output
   */
  private runPythonShitposter(text: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Sanitize the text to prevent command injection
      // Note: We're using a simple sanitization method here - for production,
      // consider a more robust approach
      const sanitizedText = text.replace(/"/g, '\\"'); // Escape double quotes
      console.log(`[DEBUG] Running Python shitposter with sanitized text: "${sanitizedText}"`);
      
      // Path to the Python script relative to where this code will run
      const pythonScript = path.join(__dirname, 'butwitter', 'shitpost.py');
      
      // Check if the script exists
      if (!fs.existsSync(pythonScript)) {
        console.error(`[DEBUG] Python shitpost script not found at: ${pythonScript}`);
        reject(new Error(`Python shitpost script not found at: ${pythonScript}`));
        return;
      }
      
      console.log(`[DEBUG] Running Python shitpost script: ${pythonScript}`);
      
      // Try different Python executable names (reusing logic from runPythonAgent)
      const pythonCommands = ['python3', 'python', 'py'];
      let pythonProcess = null;
      let errorOutput = '';
      
      // Try each Python command until one works
      for (const cmd of pythonCommands) {
        try {
          console.log(`[DEBUG] Attempting to run with ${cmd}...`);
          pythonProcess = spawn(cmd, [pythonScript, sanitizedText]);
          console.log(`[DEBUG] Spawn successful with ${cmd}`);
          break; // If spawn doesn't throw, we found a working command
        } catch (error) {
          console.log(`[DEBUG] Command ${cmd} failed: ${error.message}`);
          errorOutput += `Failed to run with ${cmd}: ${error.message}\n`;
        }
      }
      
      if (!pythonProcess) {
        console.error("[DEBUG] Could not find Python executable");
        reject(new Error(`Could not find Python executable. Tried: ${pythonCommands.join(', ')}. ${errorOutput}`));
        return;
      }
      
      let output = '';
      
      // Collect stdout data
      pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        console.log(`Python shitpost output: ${chunk}`);
        output += chunk;
      });
      
      // Collect stderr data
      pythonProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        console.error(`Python shitpost error: ${chunk}`);
        errorOutput += chunk;
      });
      
      // Add a timeout to kill the process if it takes too long
      const processTimeout = setTimeout(() => {
        if (pythonProcess) {
          console.error("[DEBUG] Python shitpost process timed out after 120 seconds");
          pythonProcess.kill();
          reject(new Error("Python shitpost process timed out after 120 seconds"));
        }
      }, 120000); // 120 second timeout (2 minutes)
      
      // Handle process completion
      pythonProcess.on('close', (code) => {
        clearTimeout(processTimeout); // Clear the timeout
        console.log(`[DEBUG] Python shitpost process exited with code ${code}`);
        if (code === 0) {
          resolve(output.trim());
        } else {
          if (errorOutput.includes('No module named')) {
            const missingModule = errorOutput.match(/No module named '([^']+)'/);
            const moduleMessage = missingModule ? missingModule[1] : 'required modules';
            
            const installMessage = `Python module(s) missing. Please run: pip3 install ${moduleMessage}`;
            console.error(installMessage);
            reject(new Error(`${installMessage}\n\nFull error: ${errorOutput}`));
          } else {
            reject(new Error(`Python shitpost process exited with code ${code}: ${errorOutput}`));
          }
        }
      });
      
      // Handle process errors
      pythonProcess.on('error', (error) => {
        clearTimeout(processTimeout); // Clear the timeout
        console.error(`[DEBUG] Failed to start Python shitpost process: ${error.message}`);
        reject(new Error(`Failed to start Python shitpost process: ${error.message}`));
      });
    });
  }
} 