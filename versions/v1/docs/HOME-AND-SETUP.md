# VexWorld Home and setup

The repository contains source. VexWorld Home contains local runtime state.

```text
repository source
  versions/v1/**

local VexWorld Home
  Windows: %USERPROFILE%\.vexworld
  Mac:     ~/.vexworld
```

The root setup/start scripts resolve `config/current-version.json`, create the Home when missing, compile the current world package, and start the local server with Home-backed session storage.

Current Home layout:

```text
.vexworld/
  home.json
  sessions/
  logs/
```

Browser local storage may retain a convenience copy of an Adventure Pair save. The server-backed checkpoint in Home is the cross-device development route when the **Save this journey in VexWorld Home** option is enabled.

Changing source, deleting a downloaded repository folder, and clearing browser data must not silently imply deleting VexWorld Home. A future uninstall/delete experience requires a separately explicit lifecycle contract.
