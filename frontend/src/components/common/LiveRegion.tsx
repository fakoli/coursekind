import { LiveRegionContext, type Politeness } from './LiveRegionContext';
import { useState, useEffect, useCallback, ReactNode, useRef } from 'react';

interface LiveRegionProviderProps {
  children: ReactNode;
}

interface QueuedMessage {
  message: string;
  politeness: Politeness;
  key: number;
}

export function LiveRegionProvider({ children }: LiveRegionProviderProps) {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');
  const messageKeyRef = useRef(0);
  const queueRef = useRef<QueuedMessage[]>([]);
  const processingRef = useRef(false);
  const processQueueRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const processQueue = () => {
      if (processingRef.current || queueRef.current.length === 0) return;

      processingRef.current = true;
      const { message, politeness } = queueRef.current.shift()!;

      if (politeness === 'assertive') {
        setAssertiveMessage('');
        setTimeout(() => {
          setAssertiveMessage(message);
          processingRef.current = false;
          processQueue();
        }, 100);
      } else {
        setPoliteMessage('');
        setTimeout(() => {
          setPoliteMessage(message);
          processingRef.current = false;
          processQueue();
        }, 100);
      }
    };

    processQueueRef.current = processQueue;
  }, []);

  const announce = useCallback((message: string, politeness: Politeness = 'polite') => {
    queueRef.current.push({
      message,
      politeness,
      key: messageKeyRef.current++,
    });
    if (processQueueRef.current) {
      processQueueRef.current();
    }
  }, []);

  useEffect(() => {
    if (politeMessage) {
      const timer = setTimeout(() => setPoliteMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [politeMessage]);

  useEffect(() => {
    if (assertiveMessage) {
      const timer = setTimeout(() => setAssertiveMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [assertiveMessage]);

  return (
    <LiveRegionContext.Provider value={{ announce }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeMessage}
      </div>
      <div
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveMessage}
      </div>
    </LiveRegionContext.Provider>
  );
}

