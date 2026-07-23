import { isIP } from "node:net";
const PLAIN_HOST_DEFAULT_PORT = "48870";
const SECURE_HOST_DEFAULT_PORT = "443";
function parseKichiHost(host) {
    const trimmed = host.trim();
    if (!trimmed) {
        throw new Error("Kichi host must be a non-empty string");
    }
    if (/[\\/?#@]/.test(trimmed)) {
        throw new Error(`Invalid Kichi host "${host}"`);
    }
    const bareIpVersion = isIP(trimmed);
    if (bareIpVersion !== 6) {
        const hasValidAuthorityShape = trimmed.startsWith("[")
            ? /^\[[^\]]+\](?::\d+)?$/.test(trimmed)
            : /^[^:]+(?::\d+)?$/.test(trimmed);
        if (!hasValidAuthorityShape) {
            throw new Error(`Invalid Kichi host "${host}"`);
        }
    }
    const authority = bareIpVersion === 6 ? `[${trimmed}]` : trimmed;
    let url;
    try {
        url = new URL(`kichi://${authority}`);
    }
    catch (error) {
        throw new Error(`Invalid Kichi host "${host}"`, { cause: error });
    }
    if (!url.hostname || url.username || url.password || url.pathname || url.search || url.hash) {
        throw new Error(`Invalid Kichi host "${host}"`);
    }
    const hostname = url.hostname.toLowerCase();
    const unwrappedHostname = hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;
    const port = url.port || undefined;
    if (port === "0") {
        throw new Error(`Invalid Kichi host port in "${host}"`);
    }
    return {
        hostname,
        ...(port ? { port } : {}),
        usesPlainWebSocket: isIP(unwrappedHostname) !== 0 || unwrappedHostname === "localhost",
    };
}
function formatAuthority(hostname, port) {
    return `${hostname}${port ? `:${port}` : ""}`;
}
export function normalizeKichiHost(host) {
    const parsed = parseKichiHost(host);
    const defaultPort = parsed.usesPlainWebSocket ? PLAIN_HOST_DEFAULT_PORT : SECURE_HOST_DEFAULT_PORT;
    const normalizedPort = parsed.port === defaultPort ? undefined : parsed.port;
    return formatAuthority(parsed.hostname, normalizedPort);
}
export function buildKichiWebSocketUrl(host) {
    const parsed = parseKichiHost(host);
    const protocol = parsed.usesPlainWebSocket ? "ws" : "wss";
    const defaultPort = parsed.usesPlainWebSocket ? PLAIN_HOST_DEFAULT_PORT : SECURE_HOST_DEFAULT_PORT;
    const normalizedPort = parsed.port === defaultPort ? undefined : parsed.port;
    const urlPort = normalizedPort ?? (parsed.usesPlainWebSocket ? PLAIN_HOST_DEFAULT_PORT : undefined);
    return `${protocol}://${formatAuthority(parsed.hostname, urlPort)}/ws/openclaw`;
}
