// Define the environment variables interface
export interface Env {
	UUID: string;
	VLESS_PATH: string;
	PROXY_HOST: string;
	FALLBACK_HOST: string;
}

// Main fetch handler
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		try {
			const url = new URL(request.url);

			// Check if the request path matches the secret VLESS path
			if (url.pathname === env.VLESS_PATH) {
				// Handle VLESS WebSocket connection
				return handleVless(request, env);
			} else {
				// For all other paths, act as a fallback proxy
				return handleFallback(request, env);
			}
		} catch (err) {
			const e = err as Error;
			console.error('Error fetching:', e.message, e.stack);
			return new Response('Internal Server Error', { status: 500 });
		}
	},
};

/**
 * Handles VLESS WebSocket connections.
 * @param request The incoming request.
 * @param env The environment variables.
 * @returns A Response object for the WebSocket connection.
 */
async function handleVless(request: Request, env: Env): Promise<Response> {
	const upgradeHeader = request.headers.get('Upgrade');
	if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
		return new Response('Expected a WebSocket Upgrade request', { status: 426 });
	}

	// Create a WebSocket pair
	const [client, server] = Object.values(new WebSocketPair());

	// The server-side WebSocket will handle the VLESS logic
	server.accept();
	server.addEventListener('message', async (event) => {
		try {
			const message = event.data as ArrayBuffer;
			// The first message from the client should contain the VLESS header
			const { remoteSocket, host, port, rawVlessHeader } = await processVlessHeader(message, env);

			// Create a readable stream from the server WebSocket
			const readable = new ReadableStream({
				start(controller) {
					server.addEventListener('message', (e) => controller.enqueue(e.data));
					server.addEventListener('close', () => controller.close());
					server.addEventListener('error', (e) => controller.error(e));
				},
			});

			// Pipe the client's data to the remote host
			await readable.pipeTo(remoteSocket.writable);

		} catch (err) {
			const e = err as Error;
			console.error('VLESS handling error:', e.message);
			// Close the WebSocket with an error code
			server.close(1011, e.message);
		}
	});

	server.addEventListener('close', () => {
		console.log('Client WebSocket closed');
	});

	server.addEventListener('error', (err) => {
		console.error('Client WebSocket error:', err);
	});

	return new Response(null, {
		status: 101,
		webSocket: client,
	});
}

/**
 * Processes the VLESS header from the client.
 * @param message The first message from the client (ArrayBuffer).
 * @param env Environment variables.
 * @returns An object containing the remote socket and connection details.
 */
async function processVlessHeader(message: ArrayBuffer, env: Env) {
	const dataView = new DataView(message);
	let offset = 0;

	// VLESS Version (1 byte)
	const version = dataView.getUint8(offset);
	offset += 1;
	if (version !== 0) {
		throw new Error(`Unsupported VLESS version: ${version}`);
	}

	// UUID (16 bytes)
	const receivedUuid = new Uint8Array(message, offset, 16);
	offset += 16;
	const expectedUuid = uuidToBytes(env.UUID);
	if (!compareArrays(receivedUuid, expectedUuid)) {
		throw new Error('Invalid UUID');
	}

	// Add-ons length (1 byte)
	const addonsLength = dataView.getUint8(offset);
	offset += 1;
	offset += addonsLength; // Skip addons for now

	// Command (1 byte) - 0x01 for TCP
	const command = dataView.getUint8(offset);
	offset += 1;
	if (command !== 1) {
		throw new Error(`Unsupported command: ${command}`);
	}

	// Port (2 bytes, big-endian)
	const port = dataView.getUint16(offset);
	offset += 2;

	// Address Type (1 byte)
	const addressType = dataView.getUint8(offset);
	offset += 1;

	let host = '';
	switch (addressType) {
		case 1: // IPv4
			host = Array.from(new Uint8Array(message, offset, 4)).join('.');
			offset += 4;
			break;
		case 2: // Domain name
			const domainLength = dataView.getUint8(offset);
			offset += 1;
			host = new TextDecoder().decode(new Uint8Array(message, offset, domainLength));
			offset += domainLength;
			break;
		case 3: // IPv6
			const ipv6Bytes = new Uint8Array(message, offset, 16);
			host = ipv6Bytes.reduce((str, byte, i) => {
				if (i % 2 === 0) str += (i === 0 ? '' : ':');
				str += byte.toString(16).padStart(2, '0');
				return str;
			}, '');
			offset += 16;
			break;
		default:
			throw new Error(`Invalid address type: ${addressType}`);
	}

    // Use PROXY_HOST if it's set and the client is trying to connect to a different host
    if (env.PROXY_HOST && host !== env.PROXY_HOST) {
        host = env.PROXY_HOST;
    }

	const rawVlessHeader = new Uint8Array(message, 0, offset);
	const data = new Uint8Array(message, offset);

	// Establish connection to the remote host
	const remoteSocket = await connect({ hostname: host, port });

    // Write the VLESS header and initial data to the remote socket
    const writer = remoteSocket.writable.getWriter();
    await writer.write(data);
    writer.releaseLock();


	return { remoteSocket, host, port, rawVlessHeader };
}

/**
 * Handles fallback requests by proxying them to a specified host.
 * @param request The incoming request.
 * @param env The environment variables.
 * @returns A proxied response from the fallback host.
 */
async function handleFallback(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const fallbackUrl = new URL(env.FALLBACK_HOST);

	// Set the destination URL
	url.hostname = fallbackUrl.hostname;
	url.port = fallbackUrl.port;
	url.protocol = fallbackUrl.protocol;

	// Create a new request to the fallback host
	const newRequest = new Request(url.toString(), request);
	newRequest.headers.set('host', fallbackUrl.hostname);

	console.log(`Fallback: Proxying request to ${url.toString()}`);
	return fetch(newRequest);
}

// --- Utility Functions ---

/**
 * Connects to a remote host and returns a TCP socket.
 * This is a placeholder as direct TCP socket connection is a paid Workers feature.
 * We use a trick with fetch to establish a connection.
 */
async function connect(addr: { hostname: string; port: number }): Promise<any> {
    const connectRequest = new Request(`https://${addr.hostname}:${addr.port}/`, {
        method: 'CONNECT',
        headers: { host: `${addr.hostname}:${addr.port}` },
    });

    try {
        // This is a special Cloudflare Workers feature that allows establishing a TCP socket.
        // It requires the 'workers.socket' compatibility flag and may be subject to limits.
        const { readable, writable } = await fetch(connectRequest) as unknown as { readable: ReadableStream, writable: WritableStream };
        return { readable, writable };
    } catch (e) {
        throw new Error(`Failed to connect to ${addr.hostname}:${addr.port}: ${(e as Error).message}`);
    }
}


/**
 * Converts a UUID string to a byte array.
 * @param uuid The UUID string.
 * @returns A 16-byte Uint8Array.
 */
function uuidToBytes(uuid: string): Uint8Array {
	const hex = uuid.replace(/-/g, '');
	const bytes = new Uint8Array(16);
	for (let i = 0; i < 16; i++) {
		bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

/**
 * Compares two Uint8Arrays for equality.
 * @param a The first array.
 * @param b The second array.
 * @returns True if the arrays are equal, false otherwise.
 */
function compareArrays(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}