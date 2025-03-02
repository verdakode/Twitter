import { TpaSession } from '@augmentos/sdk';
import { spawn } from 'child_process';
import * as path from 'path';

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
  public async getProfileInfo(username: string): Promise<string> {
    this.session.layouts.showTextWall(`Fetching Twitter profile for ${username}...`);
    
    try {
      const result = await this.runPythonAgent(username);
      return result;
    } catch (error) {
      this.session.layouts.showTextWall(`Error fetching Twitter profile: ${error.message}`);
      console.error('Twitter agent error:', error);
      return `Failed to get profile information for ${username}`;
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
      
      // Spawn Python process with username as an argument
      const pythonProcess = spawn('python', [pythonScript, username]);
      
      let output = '';
      let errorOutput = '';
      
      // Collect stdout data
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      // Collect stderr data
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      // Handle process completion
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`Python process exited with code ${code}: ${errorOutput}`));
        }
      });
    });
  }
} 