import { useState } from 'react';
import {
  Box,
  Paper,
  Button,
  CircularProgress,
  Alert,
  Snackbar,
  Typography,
  Divider,
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { apiClient, type ChatMessage, type ChatResponse } from '../../services/api';

interface ChatInterfaceProps {
  onChatResponse?: (response: ChatResponse) => void;
  onScanComplete?: () => void;
  onClearChat?: () => void;
}

export function ChatInterface({ onChatResponse, onScanComplete, onClearChat }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleClearChat = () => {
    setMessages([]);
    onClearChat?.();
  };

  const handleSendMessage = async (message: string) => {
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.sendChatMessage(message, messages);
      setMessages((prev) => [...prev, response.message]);
      onChatResponse?.(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Remove the user message if request failed
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleScanEmails = async () => {
    setIsScanning(true);
    setError(null);

    try {
      const response = await apiClient.scanEmails();
      setSuccessMessage(response.message || `Found and parsed ${response.count} flights`);

      // Add a system message to chat
      const systemMessage: ChatMessage = {
        role: 'assistant',
        content: `Email scan complete! I found and parsed ${response.count} flight confirmations. You can now ask me questions about your flights.`,
      };
      setMessages((prev) => [...prev, systemMessage]);
      onScanComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan emails');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Paper
        elevation={2}
        sx={{
          p: 2,
          mb: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Typography variant="h6">Flight Assistant</Typography>
          <Typography variant="body2" color="text.secondary">
            Ask questions about your flight history
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Button
            variant="contained"
            startIcon={isScanning ? <CircularProgress size={20} color="inherit" /> : <EmailIcon />}
            onClick={handleScanEmails}
            disabled={isScanning}
          >
            {isScanning ? 'Scanning...' : 'Scan Emails'}
          </Button>
          <Button
            variant="outlined"
            onClick={handleClearChat}
            disabled={isLoading || isScanning || messages.length === 0}
            sx={{ ml: 2 }}
          >
            Clear Chat
          </Button>
        </Box>
      </Paper>

      <Paper
        elevation={2}
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <MessageList messages={messages} isLoading={isLoading} />
        </Box>

        <Divider />

        <Box sx={{ p: 2 }}>
          <ChatInput onSendMessage={handleSendMessage} disabled={isLoading} />
        </Box>
      </Paper>

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!successMessage}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
