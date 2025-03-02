from langchain_openai import ChatOpenAI
from browser_use import Agent
from dotenv import load_dotenv
load_dotenv()

import asyncio

llm = ChatOpenAI(model="gpt-4o")

async def main():
    agent = Agent(
        task="go on x.com, sign in with username crsamra and password <password>, search for a user named <username>, click the top result to go to the profile of the user, once on the profile page and click on the button beside the three dots for the profile summary, and then copy all the text generated from the grok chat tab that appears in a div inside a floating window in the bottom right of the screen",
        llm=llm,
    )
    result = await agent.run()
    print(result)
    

asyncio.run(main())