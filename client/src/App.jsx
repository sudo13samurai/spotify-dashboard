error during build:
[vite:esbuild] Transform failed with 1 error:
/opt/render/project/src/client/src/App.jsx:1:8: ERROR: Expected ";" but found "React"
file: /opt/render/project/src/client/src/App.jsx:1:8
Expected ";" but found "React"
1  |  simport React, { useEffect, useMemo, useRef, useState } from "react";
   |          ^
2  |  
3  |  const SERVER_BASE = (import.meta.env.VITE_SERVER_BASE || "https://spotify-dashboard-xw5t.onrender.com").replace(
    at failureErrorWithLog (/opt/render/project/src/client/node_modules/esbuild/lib/main.js:1472:15)
    at /opt/render/project/src/client/node_modules/esbuild/lib/main.js:755:50
    at responseCallbacks.<computed> (/opt/render/project/src/client/node_modules/esbuild/lib/main.js:622:9)
    at handleIncomingPacket (/opt/render/project/src/client/node_modules/esbuild/lib/main.js:677:12)
    at Socket.readFromStdout (/opt/render/project/src/client/node_modules/esbuild/lib/main.js:600:7)
    at Socket.emit (node:events:518:28)
    at addChunk (node:internal/streams/readable:561:12)
    at readableAddChunkPushByteMode (node:internal/streams/readable:512:3)
    at Readable.push (node:internal/streams/readable:392:5)
    at Pipe.onStreamRead (node:internal/stream_base_commons:189:23)
