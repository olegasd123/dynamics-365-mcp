# Plugin Tooling Roadmap

This roadmap defines how to separate:

- plugin assemblies
- plugin classes (`IPlugin`)
- workflow activities (`CodeActivity`)
- steps
- images

The main goal is to stop using the word `plugin` for plugin assemblies.

## Problem

Today, the server uses plugin words for assembly-level tools.

Example:

- `list_plugins` returns plugin assemblies
- `list_plugin_steps` expects a plugin assembly name
- `get_plugin_details` shows assembly details, plugin types, steps, and images

This is confusing for Dynamics 365 developers because one assembly can contain:

- plugin classes
- workflow activity classes
- action handlers

## Target Terms

These terms should be used everywhere in code, tool names, docs, and prompt examples.

- `plugin assembly`: one DLL / assembly record in Dataverse
- `plugin`: one class that implements `IPlugin`
- `workflow activity`: one class that implements `CodeActivity`
- `step`: one registered `sdkmessageprocessingstep`
- `image`: one registered `sdkmessageprocessingstepimage`

## Milestone 1: Rename Assembly-Level Tools [done]

Goal:

- make current tool names explicit

Scope:

- rename `list_plugins` to `list_plugin_assemblies`
- rename `list_plugin_steps` to `list_plugin_assembly_steps`
- rename `list_plugin_images` to `list_plugin_assembly_images`
- rename `get_plugin_details` to `get_plugin_assembly_details`
- review `compare_plugins` and rename to `compare_plugin_assemblies`

Notes:

- response titles and summaries must say `plugin assembly`
- parameter names like `pluginName` should become `assemblyName` where possible

Done when:

- tool names and descriptions are assembly-specific
- output headings use `plugin assembly`
- README and prompt examples use the new names

## Milestone 2: Add Compatibility Aliases [done]

Goal:

- avoid breaking existing prompts and clients

Scope:

- keep old tool names for one release
- mark old names as deprecated in tool descriptions
- make old descriptions say clearly that they are assembly-level tools

Done when:

- existing prompts still work
- new prompts and docs point to the renamed tools

## Milestone 3: Add Real Plugin-Level Tools [done]

Goal:

- support plugin classes as first-class objects

Minimum new tools:

- `list_plugins`
- `get_plugin_details`
- `list_plugin_steps`

Expected behavior:

- `list_plugins` returns plugin classes, not assemblies
- supports `solution`
- supports filters like orphaned plugins with no registered steps
- outputs assembly name together with plugin type name

Done when:

- a prompt with `list plugins` returns `IPlugin` classes
- a prompt with `list plugin assemblies` returns assemblies
- the two results are clearly different

## Milestone 4: Keep Workflow Activities Separate [done]

Goal:

- do not mix `CodeActivity` classes into plugin results

Scope:

- define filter logic for plugin types
- only include classes that represent real plugins
- keep workflow activity tools under workflow terminology

Open point:

- action handlers may need either:
  - separate handling
  - or clear notes in docs about how they appear in Dataverse

Done when:

- plugin tools do not return workflow activity classes
- docs explain the boundary

## Milestone 5: Refactor Shared Inventory Layer [done]

Goal:

- avoid duplicate query logic

Scope:

- reuse current assembly, type, step, and image fetch logic
- add grouping and filtering helpers for:
  - assembly view
  - plugin class view
  - workflow activity view if needed later

Done when:

- assembly-level and plugin-level tools share one fetch model
- orphan logic is consistent across tools

## Milestone 6: Update Documentation [done]

Goal:

- make prompts and docs match the new model

Files to update:

- `README.md`
- `docs/prompt-examples.md`
- tool descriptions in `src/tools/plugins`
- any comparison docs and examples

Doc changes:

- replace wrong uses of `plugin` with `plugin assembly`
- add examples for:
  - list plugin assemblies
  - list plugins
  - list plugin steps for one plugin class
  - compare plugin assemblies

Done when:

- docs use the target terms consistently
- manual test prompts cover both assembly-level and plugin-level tools

## Milestone 7: Update Tests And Tool Contracts

Goal:

- keep tool behavior stable and clear

Scope:

- update tool registration tests
- update integration tests for renamed tools
- add tests for new plugin-level tools
- add tests for deprecated aliases
- add tests for orphaned plugin class detection

Done when:

- all tests pass
- tool contract tests reflect the new tool list

## Suggested Delivery Order

1. Rename current assembly-level tools
2. Add deprecated aliases
3. Add real plugin-level tools
4. Update docs and prompt examples
5. Update tests and contracts
6. Remove deprecated aliases in a later release

## Success Criteria

The roadmap is complete when:

- `plugin` means `IPlugin` class
- `plugin assembly` means assembly only
- prompts for plugins and plugin assemblies return different results
- docs are clear for Dynamics 365 developers
