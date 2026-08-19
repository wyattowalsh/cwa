# Design: compatibility runtime

Critical selector is `message` (`[data-message-author-role]`). Sidebar/composer misses degrade UX but do not enter safe mode by themselves.

Safe mode skips sidebar resize and minimap rebuild. Toolbar, palette, and export events stay mounted.

Diagnostics classify href as conversation/settings/other and never persist DOM text.
