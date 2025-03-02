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
      
      // Try to parse the JSON from the result
      try {
        // Extract JSON from the text response
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
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
        }
      } catch (parseError) {
        console.error('Error parsing Twitter profile JSON:', parseError);
        // If JSON parsing fails, return the raw text
        return {
          username: username,
          description: "Could not parse profile data",
          posts: [{
            date: "N/A",
            content: result,
            link: ""
          }]
        };
      }
      
      // If we couldn't extract JSON, return the raw text
      return {
        username: username,
        description: "Raw profile data",
        posts: [{
          date: "N/A",
          content: result,
          link: ""
        }]
      };
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
      // Path to the Python script relative to where this code will run
      const pythonScript = path.join(__dirname, 'butwitter', 'agent.py');
      
      // Check if the script exists
      if (!fs.existsSync(pythonScript)) {
        console.error(`Python script not found at: ${pythonScript}`);
        reject(new Error(`Python script not found at: ${pythonScript}`));
        return;
      }
      
      console.log(`Running Python script: ${pythonScript}`);
      
      // Try different Python executable names
      const pythonCommands = ['python3', 'python', 'py'];
      let pythonProcess = null;
      let errorOutput = '';
      
      // Try each Python command until one works
      for (const cmd of pythonCommands) {
        try {
          console.log(`Attempting to run with ${cmd}...`);
          pythonProcess = spawn(cmd, [pythonScript, username]);
          break; // If spawn doesn't throw, we found a working command
        } catch (error) {
          console.log(`Command ${cmd} failed: ${error.message}`);
          errorOutput += `Failed to run with ${cmd}: ${error.message}\n`;
        }
      }
      
      if (!pythonProcess) {
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
      
      // Handle process completion
      pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}`);
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
        console.error(`Failed to start Python process: ${error.message}`);
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  }
} 