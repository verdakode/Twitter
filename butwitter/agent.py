from langchain_openai import ChatOpenAI
from browser_use import Agent
from dotenv import load_dotenv
import asyncio
import sys

load_dotenv()

llm = ChatOpenAI(model="gpt-4o")


async def get_twitter_profile(username):
    agent = Agent(
        task=f"go on x.com, search for a user named {username}, click the top result to go to the profile of the user, once on the profile page and click on the button beside the three dots for the profile summary, and then copy all the text generated from the grok chat tab that appears in a div inside a floating window in the bottom right of the screen",
        llm=llm,
    )
    result = await agent.run()
    return result


async def main():
    # Get username from command line arguments or use default
    username = sys.argv[1] if len(sys.argv) > 1 else "elonmusk"
    result = await get_twitter_profile(username)
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
