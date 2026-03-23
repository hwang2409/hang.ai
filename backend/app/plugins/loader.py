import importlib
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import APIRouter

logger = logging.getLogger(__name__)


@dataclass
class PluginInfo:
    id: str
    name: str
    description: str
    version: str
    author: str
    router: APIRouter | None = None
    models_module: Any = None
    automation_triggers: dict = field(default_factory=dict)
    automation_actions: dict = field(default_factory=dict)
    task_prompts: dict = field(default_factory=dict)
    selection_prompts: dict = field(default_factory=dict)
    frontend: dict = field(default_factory=dict)


PLUGIN_REGISTRY: dict[str, PluginInfo] = {}


def discover_plugins() -> None:
    """Scan backend/plugins/ for plugin directories, import manifests, populate PLUGIN_REGISTRY."""
    plugins_dir = Path(__file__).resolve().parent.parent.parent / "plugins"
    if not plugins_dir.is_dir():
        logger.info("No plugins directory found at %s", plugins_dir)
        return

    for entry in sorted(plugins_dir.iterdir()):
        if not entry.is_dir() or entry.name.startswith("_"):
            continue
        try:
            # Import the plugin package
            module = importlib.import_module(f"plugins.{entry.name}")
            manifest = getattr(module, "PLUGIN_MANIFEST", None)
            if manifest is None:
                logger.warning("Plugin %s has no PLUGIN_MANIFEST, skipping", entry.name)
                continue

            info = PluginInfo(
                id=manifest["id"],
                name=manifest["name"],
                description=manifest.get("description", ""),
                version=manifest.get("version", "0.0.0"),
                author=manifest.get("author", ""),
                automation_triggers=manifest.get("automation_triggers", {}),
                automation_actions=manifest.get("automation_actions", {}),
                task_prompts=manifest.get("task_prompts", {}),
                selection_prompts=manifest.get("selection_actions", {}),
                frontend=manifest.get("frontend", {}),
            )

            # Resolve router
            routes_ref = manifest.get("routes")
            if routes_ref:
                # Format: ".router:router"
                mod_path, attr_name = routes_ref.split(":")
                router_module = importlib.import_module(f"plugins.{entry.name}{mod_path}")
                info.router = getattr(router_module, attr_name)

            # Resolve models module (so SQLAlchemy registers tables)
            models_ref = manifest.get("models")
            if models_ref:
                info.models_module = importlib.import_module(f"plugins.{entry.name}{models_ref}")

            PLUGIN_REGISTRY[info.id] = info
            logger.info("Loaded plugin: %s v%s", info.name, info.version)

        except Exception:
            logger.exception("Failed to load plugin: %s", entry.name)
