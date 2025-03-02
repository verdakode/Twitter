from langchain_openai import ChatOpenAI
from browser_use import Agent
from dotenv import load_dotenv
import asyncio
import sys

load_dotenv()

llm = ChatOpenAI(model="gpt-4o")


async def get_twitter_profile(text):
    agent = Agent(
        task=f"go on x.com, login with username <user> and password <password> post a tweet with the text {text}, click the post button.",
        llm=llm,
    )
    result = await agent.run()
    return result


async def main():
    # Get username from command line arguments or use default
    text = sys.argv[1] if len(sys.argv) > 1 else "elonmusk"
    result = await get_twitter_profile(text)
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
