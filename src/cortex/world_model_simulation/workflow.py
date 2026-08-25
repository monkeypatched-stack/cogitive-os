"""Workflow."""

from __future__ import annotations

import logging

from . import entity_resolver
from . import knowledge_retriever
from . import generic_analyzer
from . import answer_generator
from lemon import Lemon

lemon = Lemon()


def run_simulation():
    try:
        # Step 1: Entity Resolver
        logging.info("Starting Entity Resolver...")
        entity_resolver_result = entity_resolver.run()
        logging.info(f"Entity Resolver finished with result: {entity_resolver_result}")

        # Step 2: Knowledge Retriever
        logging.info("Starting Knowledge Retriever...")
        knowledge_retriever_result = knowledge_retriever.run(entity_resolver_result)
        logging.info(f"Knowledge Retriever finished with result: {knowledge_retriever_result}")

        # Step 3: Generic Analyzer
        logging.info("Starting Generic Analyzer...")
        generic_analyzer_result = generic_analyzer.run(knowledge_retriever_result)
        logging.info(f"Generic Analyzer finished with result: {generic_analyzer_result}")

        # Step 4: Answer Generator
        logging.info("Starting Answer Generator...")
        answer_generator_result = answer_generator.run(generic_analyzer_result)
        logging.info(f"Answer Generator finished with result: {answer_generator_result}")

        return answer_generator_result

    except Exception as e:
        logging.error(f"An error occurred: {e}")
        return {"structured fallback": True}  # Return structured fallback on any errors


if __name__ == "__main__":
    run_simulation()
