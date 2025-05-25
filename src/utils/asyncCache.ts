import dgram from 'dgram';
import { Cache, CacheConstructorOptions } from './cache'; // Assuming original class is in cache.ts


export type CacheBoadcastMessage =
	{
		action: 'clear';
		key: string;
	}
	| {
		action: 'clearTag';
		tag: string;
	};
export class AsyncCache extends Cache {
	private port: number;
	private socket: dgram.Socket;

	constructor(options: CacheConstructorOptions & { port: number }) {
		super(options);
		this.port = options.port;

		// Set up UDP listener
		this.socket = dgram.createSocket('udp4');
		this.socket.bind(this.port, () => {
			this.socket.setBroadcast(true);
		});

		this.socket.on('message', (msg) => {
			try {
				const message = JSON.parse(msg.toString()) as CacheBoadcastMessage
				switch (message.action) {
					case 'clear':
						super.Clear(message.key);
						break;
					case 'clearTag':
						super.ClearByTag(message.tag);
						break;
					default:
						break;
				}
			} catch (err) {
				console.warn('Failed to parse broadcast message', err);
			}
		});
	}

	private broadcast(msg: object) {
		const message = Buffer.from(JSON.stringify(msg));
		this.socket.send(message, 0, message.length, this.port, '255.255.255.255');
	}

	override Clear(key: string) {
		super.Clear(key);
		this.broadcast({ action: 'clear', key });
	}

	override ClearByTag(tag: string) {
		super.ClearByTag(tag);
		this.broadcast({ action: 'clearTag', tag });
	}

	// Optional: shutdown hook to close socket
	shutdown() {
		this.socket.close();
	}
}
