PLUGIN_MANIFEST = {
    "id": "custom_prompts",
    "name": "Custom Prompts",
    "description": "Create your own LLM prompt templates for selection actions",
    "version": "1.0.0",
    "author": "Neuronic",
    "routes": ".router:router",
    "models": ".models",
    "frontend": {
        "nav_items": [],
        "dashboard_widgets": [],
        "settings_sections": [{"id": "custom_prompts", "label": "custom prompts"}],
        "selection_actions": [],
    },
}
