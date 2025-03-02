from langchain_openai import ChatOpenAI
from browser_use import Agent
import asyncio
from dotenv import load_dotenv

load_dotenv()


async def main():
    agent = Agent(
        task="go to thingiverse.com, click allow all, click on the search bar, enter in the text you've recieved, and then hit enter, if there are ads or if it asks you to get a membership, close it, then choose the first thing, then hit download all files, then hit save then log out that file path",
        llm=ChatOpenAI(model="gpt-4o"),
    )
    await agent.run()


asyncio.run(main())
