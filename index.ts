import { TpaServer, TpaSession } from '@augmentos/sdk';
import { TwitterAgent } from './twitterAgent';
import path from 'path';
import fs from 'fs';

class TwitterGlassesApp extends TpaServer {
  // Track state
  private isDisplayingTwitterInfo: boolean = false;
  private twitterChunks: string[] = [];
  private currentChunkIndex: number = 0;
  private autoAdvanceTimer: NodeJS.Timeout | null = null;
  private isAutoAdvancing: boolean = false;
  private readingSpeed: number = 5000; // Default speed (ms per chunk)
  private overlapTime: number = 1800; // Default overlap time
  
  // Add state for username confirmation
  private pendingUsername: string | null = null;
  private isAwaitingConfirmation: boolean = false;

  // Add a new property to track the confirmation timeout
  private confirmationTimeout: NodeJS.Timeout | null = null;

  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    // Show welcome message
    session.layouts.showTextWall("Twitter Glasses App Ready!");
    
    // Initialize Twitter agent
    const twitterAgent = new TwitterAgent(session);
    
    // Track glasses status
    let glassesStatus = "Unknown";
    
    // Handle real-time transcription
    const cleanup = [
      session.events.onTranscription((data) => {
        // Log all transcriptions for debugging
        console.log(`[DEBUG] Transcription (${data.isFinal ? 'final' : 'partial'}): "${data.text}"`);
        
        // Process voice commands
        const text = data.text.toLowerCase();
        
        if (data.isFinal) {
          // Check if we're waiting for username confirmation
          if (this.isAwaitingConfirmation) {
            console.log(`Received confirmation input: "${text}"`);
            
            if (text.includes('yes') || text.includes('correct') || text.includes('right') || text.includes('confirm')) {
              console.log("[DEBUG] Confirmation received: YES");
              // User confirmed the username
              this.isAwaitingConfirmation = false;
              const username = this.pendingUsername;
              this.pendingUsername = null;
              
              // Clear the timeout
              if (this.confirmationTimeout) {
                clearTimeout(this.confirmationTimeout);
                this.confirmationTimeout = null;
              }
              
              if (username) {
                console.log(`[DEBUG] About to fetch profile for: "${username}"`);
                session.layouts.showTextWall(`Getting Twitter info for: ${username}...`);
                this.fetchTwitterProfile(session, twitterAgent, username);
              }
            } else if (text.includes('no') || text.includes('wrong') || text.includes('incorrect') || text.includes('cancel')) {
              console.log("Confirmation received: NO");
              // User rejected the username
              this.isAwaitingConfirmation = false;
              this.pendingUsername = null;
              
              // Clear the timeout
              if (this.confirmationTimeout) {
                clearTimeout(this.confirmationTimeout);
                this.confirmationTimeout = null;
              }
              
              session.layouts.showTextWall("Twitter profile lookup cancelled. Please try again with a clear username.");
            } else if (text.includes('twitter profile') || text.includes('get twitter info')) {
              // User is trying to look up a different username
              const newUsername = text.replace(/twitter profile|get twitter info/gi, "").trim();
              if (newUsername) {
                this.pendingUsername = newUsername;
                session.layouts.showTextWall(`Changed username. Did you want to look up "${newUsername}"? Please say yes or no.`);
              } else {
                session.layouts.showTextWall(`Did you want to look up "${this.pendingUsername}"? Please say yes or no.`);
              }
            } else if (text.includes("cancel lookup") || text.includes("stop confirmation")) {
              if (this.isAwaitingConfirmation) {
                console.log("Confirmation manually cancelled");
                this.isAwaitingConfirmation = false;
                this.pendingUsername = null;
                
                if (this.confirmationTimeout) {
                  clearTimeout(this.confirmationTimeout);
                  this.confirmationTimeout = null;
                }
                
                session.layouts.showTextWall("Twitter profile lookup cancelled.");
              }
            } else {
              console.log("Unclear confirmation response");
              // Unclear response, ask again
              session.layouts.showTextWall(`Did you want to look up "${this.pendingUsername}"? Please say yes or no.`);
            }
          }
          // Twitter profile commands
          else if (
            text.includes("twitter") || 
            text.includes("profile") || 
            text.includes("get info") ||
            text.includes("look up") ||
            text.includes("lookup")
          ) {
            console.log("[DEBUG] Detected potential Twitter command:", text);
            
            // Check for more specific Twitter-related patterns
            if (
              text.includes("twitter profile") || 
              text.includes("get twitter info") ||
              (text.includes("twitter") && text.includes("profile")) ||
              (text.includes("get") && text.includes("info")) ||
              text.includes("look up") ||
              text.includes("lookup")
            ) {
              this.handleTwitterProfileCommand(session, twitterAgent, text);
            } else {
              // If it's just a mention of Twitter but not a clear command
              session.layouts.showTextWall("To look up a Twitter profile, say 'Twitter profile [username]' or 'lookup [username]'");
            }
          }
          
          // Debug command to show app state
          else if (text.includes("debug state") || text.includes("show debug")) {
            const state = {
              isDisplayingTwitterInfo: this.isDisplayingTwitterInfo,
              isAwaitingConfirmation: this.isAwaitingConfirmation,
              pendingUsername: this.pendingUsername,
              chunksCount: this.twitterChunks.length,
              currentChunk: this.currentChunkIndex,
              isAutoAdvancing: this.isAutoAdvancing
            };
            
            session.layouts.showTextWall(`App State: ${JSON.stringify(state, null, 2)}`, {
              durationMs: 10000
            });
          }
          
          // Navigation commands when displaying Twitter info
          else if (this.isDisplayingTwitterInfo) {
            if (text.includes('auto') || text.includes('play') || text.includes('start reading')) {
              // Start auto-advancing through chunks
              this.startAutoAdvance(session);
              session.layouts.showTextWall("Auto-advancing through Twitter info. Say 'pause' to stop.", {
                durationMs: 3000
              });
            } else if (text.includes('faster') || text.includes('speed up')) {
              // Increase reading speed
              this.adjustReadingSpeed(session, -500); // Reduce time between chunks
            } else if (text.includes('slower') || text.includes('slow down')) {
              // Decrease reading speed
              this.adjustReadingSpeed(session, 500); // Increase time between chunks
            } else if (text.includes('next') || text.includes('continue')) {
              // Stop auto-advance if it's running
              this.stopAutoAdvance();
              
              // Manually go to next chunk
              this.currentChunkIndex++;
              if (this.currentChunkIndex >= this.twitterChunks.length) {
                this.currentChunkIndex = this.twitterChunks.length - 1;
                session.layouts.showTextWall("End of Twitter information reached.");
              } else {
                this.displayTwitterChunk(session);
              }
            } else if (text.includes('previous') || text.includes('back')) {
              // Stop auto-advance if it's running
              this.stopAutoAdvance();
              
              this.currentChunkIndex--;
              if (this.currentChunkIndex < 0) {
                this.currentChunkIndex = 0;
                session.layouts.showTextWall("Already at the beginning of Twitter information.");
              } else {
                this.displayTwitterChunk(session);
              }
            } else if (text.includes('stop') || text.includes('exit') || text.includes('pause')) {
              // Stop auto-advance if it's running
              this.stopAutoAdvance();
              
              this.isDisplayingTwitterInfo = false;
              session.layouts.showTextWall("Twitter info reading paused. Say 'resume' to continue reading.", {
                durationMs: 5000
              });
            } else if (text.includes('restart')) {
              // Stop auto-advance if it's running
              this.stopAutoAdvance();
              
              this.currentChunkIndex = 0;
              this.displayTwitterChunk(session);
            }
          }
          // Show glasses status
          else if (text.includes("glasses status") || text.includes("show status")) {
            session.layouts.showTextWall(`Glasses Status: ${glassesStatus}`);
          }
          // Resume Twitter info display
          else if (!this.isDisplayingTwitterInfo && this.twitterChunks.length > 0 && 
                  (text.includes('resume') || text.includes('continue reading'))) {
            this.isDisplayingTwitterInfo = true;
            this.startAutoAdvance(session);
          }
          // Add a direct test command
          else if (text.includes("test twitter") || text.includes("test profile")) {
            console.log("[DEBUG] Running Twitter profile test command");
            const testUsername = "elonmusk"; // Use a known username for testing
            session.layouts.showTextWall(`Running test lookup for ${testUsername}...`);
            this.fetchTwitterProfile(session, twitterAgent, testUsername);
          }
          // Add a debug lookup command
          else if (text.includes("debug lookup")) {
            const debugUsername = text.replace(/debug lookup/gi, "").trim() || "elonmusk";
            console.log(`[DEBUG] Manual lookup triggered for: ${debugUsername}`);
            session.layouts.showTextWall(`Manual lookup for: ${debugUsername}`);
            this.fetchTwitterProfile(session, twitterAgent, debugUsername);
          }
          // Add a direct lookup command
          else if (text.includes("direct lookup")) {
            const directUsername = text.replace(/direct lookup/gi, "").trim() || "elonmusk";
            console.log(`[DEBUG] Direct lookup triggered for: ${directUsername}`);
            session.layouts.showTextWall(`Starting direct lookup for: ${directUsername}`);
            
            // Skip confirmation and go straight to lookup
            this.fetchTwitterProfile(session, twitterAgent, directUsername);
          }
          // Add a direct command for "look up"
          else if (text.startsWith("look up ")) {
            const directUsername = text.replace(/look up /gi, "").trim();
            console.log(`[DEBUG] Direct lookup triggered for: ${directUsername}`);
            session.layouts.showTextWall(`Starting direct lookup for: ${directUsername}`);
            
            // Skip confirmation and go straight to lookup
            this.fetchTwitterProfile(session, twitterAgent, directUsername);
          }
          // Regular transcription display
          else {
            session.layouts.showTextWall(data.text, {
              durationMs: 3000
            });
          }
        } else {
          // Show in-progress transcription only if not displaying Twitter info and not awaiting confirmation
          if (!this.isDisplayingTwitterInfo && !this.isAwaitingConfirmation) {
            session.layouts.showTextWall(data.text);
          } else if (this.isAwaitingConfirmation) {
            // When awaiting confirmation, show the partial transcription with a reminder
            session.layouts.showTextWall(`${data.text}\n\n(Waiting for yes/no to confirm Twitter lookup for "${this.pendingUsername}")`);
          }
        }
      }),

      session.events.onPhoneNotifications((data) => {
        // Display phone notifications if needed
        session.layouts.showTextWall(`Notification: ${data.title}`, {
          durationMs: 5000
        });
      }),

      session.events.onGlassesBattery((data) => {
        // Update glasses status with battery information
        glassesStatus = `Battery: ${data.level}%, Charging: ${data.charging ? 'Yes' : 'No'}`;
        
        // Show low battery warning
        if (data.level < 20 && !data.charging) {
          session.layouts.showTextWall(`Low Battery Warning: ${data.level}%`, {
            durationMs: 5000
          });
        }
      }),

      session.events.onError((error) => {
        console.error('Error:', error);
        session.layouts.showTextWall(`Error: ${error.message}`, {
          durationMs: 5000
        });
      }),
      
      // Add cleanup for timers when session ends
      () => {
        this.stopAutoAdvance();
      }
    ];

    // Add cleanup handlers
    cleanup.forEach(handler => this.addCleanupHandler(handler));

    // In the onSession method, add a periodic check
    const connectionCheck = setInterval(() => {
      console.log("[DEBUG] Session connection check");
      session.layouts.showTextWall("Voice recognition active. Say 'Twitter profile [username]' to look up a profile.", {
        durationMs: 5000
      });
    }, 60000); // Check every minute

    // Add the interval to cleanup
    this.addCleanupHandler(() => {
      clearInterval(connectionCheck);
    });

    // Show a reminder of available commands after 5 seconds
    setTimeout(() => {
      session.layouts.showTextWall(
        "Available commands:\n" +
        "- 'Twitter profile [username]'\n" +
        "- 'Lookup [username]'\n" +
        "- 'Direct lookup [username]'\n" +
        "- 'Test profile'", 
        { durationMs: 10000 }
      );
    }, 5000);
  }
  
  /**
   * Fetch Twitter profile information
   */
  private fetchTwitterProfile(session: TpaSession, twitterAgent: TwitterAgent, username: string): void {
    console.log(`[DEBUG] fetchTwitterProfile called with username: "${username}"`);
    
    // Show loading message
    session.layouts.showTextWall(`Fetching Twitter profile for ${username}...`);
    
    // Set flag to indicate we're displaying Twitter info
    this.isDisplayingTwitterInfo = true;
    
    twitterAgent.getProfileInfo(username)
      .then(profileInfo => {
        console.log(`[DEBUG] Profile info received:`, profileInfo ? "success" : "null");
        
        if (profileInfo) {
          // Format the profile information
          let profileText = `Twitter Profile: @${profileInfo.username}\n\n`;
          profileText += `${profileInfo.description}\n\n`;
          
          // Add posts
          if (profileInfo.posts && profileInfo.posts.length > 0) {
            profileText += "Recent Posts:\n\n";
            
            profileInfo.posts.forEach(post => {
              profileText += `${post.date}\n${post.content}\n\n`;
            });
          } else {
            profileText += "No recent posts found.";
          }
          
          console.log("[DEBUG] Formatted profile text:", profileText);
          
          // Chunk the text for better readability
          this.twitterChunks = this.chunkText(profileText, 500, 200);
          this.currentChunkIndex = 0;
          
          console.log(`[DEBUG] Chunked Twitter profile into ${this.twitterChunks.length} parts`);
          
          // Display the first chunk immediately
          this.displayTwitterChunk(session);
          
          // Start auto-advancing through the chunks
          this.startAutoAdvance(session);
        } else {
          // Handle case where no profile was found
          session.layouts.showTextWall(`Could not find Twitter profile for ${username}.`);
          this.isDisplayingTwitterInfo = false;
        }
      })
      .catch(error => {
        console.error("[DEBUG] Error fetching Twitter profile:", error);
        session.layouts.showTextWall(`Error fetching Twitter profile: ${error.message}`);
        this.isDisplayingTwitterInfo = false;
      });
  }
  
  /**
   * Format Twitter profile data into readable text
   */
  private formatTwitterProfile(profile: any): string {
    if (!profile) return "No profile data available";
    
    let formattedText = `📱 TWITTER PROFILE: ${profile.username}\n\n`;
    formattedText += `📝 ABOUT:\n${profile.description}\n\n`;
    formattedText += `🔍 RECENT POSTS:\n\n`;
    
    if (profile.posts && profile.posts.length > 0) {
      profile.posts.forEach((post: any, index: number) => {
        formattedText += `[${post.date}] ${post.content}\n\n`;
      });
    } else {
      formattedText += "No recent posts found.\n";
    }
    
    return formattedText;
  }
  
  private displayTwitterChunk(session: TpaSession): void {
    if (this.currentChunkIndex >= 0 && this.currentChunkIndex < this.twitterChunks.length) {
      const chunk = this.twitterChunks[this.currentChunkIndex];
      const progress = `[${this.currentChunkIndex + 1}/${this.twitterChunks.length}]`;
      
      // Display the chunk with progress indicator
      session.layouts.showTextWall(`${progress}\n\n${chunk}`, {
        durationMs: this.readingSpeed,
        preserveLineBreaks: true,
        preserveWhitespace: true
      });
      
      console.log(`[DEBUG] Displaying Twitter chunk ${this.currentChunkIndex + 1}/${this.twitterChunks.length}`);
      
      // Pre-load the next chunk to eliminate gaps
      if (this.isAutoAdvancing && this.currentChunkIndex < this.twitterChunks.length - 1) {
        setTimeout(() => {
          if (this.isAutoAdvancing) {
            this.currentChunkIndex++;
            this.displayTwitterChunk(session);
          }
        }, this.readingSpeed - this.overlapTime);
      }
    }
  }
  
  private startAutoAdvance(session: TpaSession): void {
    // Clear any existing timer
    this.stopAutoAdvance();
    
    // Set flag
    this.isAutoAdvancing = true;
    
    // Start displaying chunks immediately
    this.displayTwitterChunk(session);
  }
  
  private stopAutoAdvance(): void {
    // Clear any interval timer
    if (this.autoAdvanceTimer) {
      clearInterval(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
    
    // Also clear any pending setTimeout callbacks by setting the flag
    this.isAutoAdvancing = false;
    
    console.log('Auto-advance stopped at chunk', this.currentChunkIndex + 1);
  }

  private adjustReadingSpeed(session: TpaSession, adjustment: number): void {
    const oldSpeed = this.readingSpeed;
    
    // Adjust the reading speed
    this.readingSpeed = Math.max(500, Math.min(10000, this.readingSpeed + adjustment));
    
    // Adjust the overlap time to be slightly less than the reading speed
    this.overlapTime = Math.max(400, this.readingSpeed - 200);
    
    // Provide feedback about the speed change
    let speedMessage = "";
    if (adjustment < 0) {
      speedMessage = `Reading speed increased. Now showing each chunk for ${(this.readingSpeed/1000).toFixed(1)} seconds.`;
    } else {
      speedMessage = `Reading speed decreased. Now showing each chunk for ${(this.readingSpeed/1000).toFixed(1)} seconds.`;
    }
    
    session.layouts.showTextWall(speedMessage, {
      durationMs: 2000
    });
    
    console.log(`Reading speed adjusted from ${oldSpeed}ms to ${this.readingSpeed}ms`);
    
    // If we're currently auto-advancing, restart with the new speed
    if (this.isAutoAdvancing) {
      // Stop the current auto-advance
      this.stopAutoAdvance();
      
      // Wait a moment to show the speed change message
      setTimeout(() => {
        // Restart auto-advance with new speed
        this.startAutoAdvance(session);
      }, 2000);
    }
  }
  
  // Helper function to chunk text into readable segments
  private chunkText(text: string, maxLength: number, overlap: number): string[] {
    const chunks: string[] = [];
    let startPos = 0;
    
    while (startPos < text.length) {
      // Find a good breaking point near maxLength
      let endPos = Math.min(startPos + maxLength, text.length);
      
      // If we're not at the end of the text, try to find a natural break point
      if (endPos < text.length) {
        // Look for a period, question mark, or exclamation followed by a space
        const periodPos = text.lastIndexOf('. ', endPos);
        const questionPos = text.lastIndexOf('? ', endPos);
        const exclamationPos = text.lastIndexOf('! ', endPos);
        
        // Find the closest sentence end that's not too far back
        const minBreakPos = startPos + (maxLength / 2); // Don't go back more than half the chunk
        const breakPos = Math.max(
          periodPos > minBreakPos ? periodPos + 2 : -1,
          questionPos > minBreakPos ? questionPos + 2 : -1,
          exclamationPos > minBreakPos ? exclamationPos + 2 : -1
        );
        
        if (breakPos !== -1) {
          endPos = breakPos;
        } else {
          // If no sentence break, look for a space
          const spacePos = text.lastIndexOf(' ', endPos);
          if (spacePos > minBreakPos) {
            endPos = spacePos + 1;
          }
        }
      }
      
      // Add the chunk
      chunks.push(text.substring(startPos, endPos));
      
      // Move to next chunk with overlap
      startPos = endPos - overlap;
    }
    
    return chunks;
  }

  // Add this method to the TwitterGlassesApp class
  private handleTwitterProfileCommand(session: TpaSession, twitterAgent: TwitterAgent, text: string): void {
    console.log("[DEBUG] Twitter profile command handler called with:", text);
    
    // Extract username with more flexible patterns
    let username = "";
    
    if (text.includes("twitter profile")) {
      username = text.replace(/twitter profile/gi, "").trim();
    } else if (text.includes("get twitter info")) {
      username = text.replace(/get twitter info/gi, "").trim();
    } else if (text.includes("twitter") && text.includes("profile")) {
      // More flexible matching
      username = text.replace(/.*twitter.*profile/gi, "").trim();
    } else if (text.includes("get") && text.includes("info")) {
      username = text.replace(/.*get.*info/gi, "").trim();
    } else if (text.includes("look up")) {
      username = text.replace(/.*look up/gi, "").trim();
    } else if (text.includes("lookup")) {
      username = text.replace(/.*lookup/gi, "").trim();
    }
    
    // If username is empty, use a default
    if (!username) {
      username = "elonmusk"; // Default username
      console.log("[DEBUG] Using default username: elonmusk");
    }
    
    console.log("[DEBUG] Extracted username:", username);
    
    // Store the username and ask for confirmation
    this.pendingUsername = username;
    this.isAwaitingConfirmation = true;
    
    // Clear any existing timeout
    if (this.confirmationTimeout) {
      clearTimeout(this.confirmationTimeout);
    }
    
    // Set a timeout to cancel confirmation after 15 seconds
    this.confirmationTimeout = setTimeout(() => {
      if (this.isAwaitingConfirmation) {
        console.log("Confirmation timed out");
        this.isAwaitingConfirmation = false;
        this.pendingUsername = null;
        session.layouts.showTextWall("Twitter profile lookup timed out. Please try again.");
      }
    }, 15000);
    
    session.layouts.showTextWall(`Did you want to look up "${username}"? Please say yes or no.`);
  }
}

// Start the server
// DEV CONSOLE URL: https://augmentos.dev/
// Get your webhook URL from ngrok (or whatever public URL you have)
const app = new TwitterGlassesApp({
  packageName: 'org.augmentos.twitter', // make sure this matches your app in dev console
  apiKey: 'your_api_key', // Not used right now, play nice
  port: 80, // Using port 3000 to avoid permission issues
  augmentOSWebsocketUrl: 'wss://staging.augmentos.org/tpa-ws' //AugmentOS url
});

app.start().catch(console.error);
