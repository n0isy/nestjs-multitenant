import type { Server } from 'node:net';

/**
 * Generates a random port within a safe range
 * Using ports 10000-65000 to avoid common service ports
 */
const getRandomPort = (): number => {
  return Math.floor(Math.random() * (65000 - 10000 + 1)) + 10000;
};

/**
 * Starts the server using a pool of random ports
 * Tries @param tries times with different random ports
 * Returns the port that was successfully started
 * @param server The server to start
 * @param tries Number of attempts (default: 10)
 * @param portPool Optional array of specific ports to try
 */
export const startServerAfterTries = (
  server: Server,
  tries = 10,
  portPool?: number[]
): Promise<number> => {
  return new Promise((resolve, reject) => {
    const attemptedPorts = new Set<number>();
    let currentTry = 0;

    const tryStart = () => {
      if (currentTry >= tries) {
        reject(new Error(`Could not start server after ${tries} attempts. Tried ports: ${Array.from(attemptedPorts).join(', ')}`));
        return;
      }

      // Remove all previous error listeners to avoid memory leaks
      server.removeAllListeners('error');
      server.removeAllListeners('listening');

      // Get next port to try
      let port: number;
      if (portPool && portPool.length > currentTry) {
        port = portPool[currentTry];
      } else {
        // Use 0 to let the OS assign a random available port
        // This is more reliable than trying specific ports
        port = 0;
      }

      attemptedPorts.add(port);
      currentTry++;

      server.once('error', (error: any) => {
        if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
          // Port is in use or access denied, try another port
          setImmediate(tryStart);
        } else {
          // Some other error occurred
          reject(error);
        }
      });

      server.once('listening', () => {
        const address = server.address();

        if (!address || typeof address === 'string') {
          reject(new Error('Could not determine server address'));
          return;
        }

        resolve(address.port);
      });

      try {
        server.listen(port);
      } catch (error) {
        // Synchronous errors during listen
        reject(error);
      }
    };

    tryStart();
  });
};

/**
 * Creates a pool of random ports for testing
 * @param size Number of ports to generate
 */
export const createPortPool = (size: number): number[] => {
  const ports = new Set<number>();
  
  while (ports.size < size) {
    ports.add(getRandomPort());
  }
  
  return Array.from(ports);
};