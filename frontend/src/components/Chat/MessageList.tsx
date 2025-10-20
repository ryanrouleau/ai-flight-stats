import { useEffect, useRef } from 'react';
import { Box, Paper, Typography, Avatar, keyframes } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../../services/api';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
}

const bounce = keyframes`
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-8px);
  }
`;

export function MessageList({ messages, isLoading = false }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  if (messages.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'text.secondary',
          bgcolor: 'grey.50',
        }}
      >
        <Typography variant="body1">
          Start by scanning your emails or ask a question about your flights
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        p: 2,
        bgcolor: 'grey.50',
      }}
    >
      {messages.map((message, index) => {
        const isUser = message.role === 'user';
        return (
          <Box
            key={index}
            sx={{
              display: 'flex',
              gap: 1.5,
              alignItems: 'flex-start',
              flexDirection: isUser ? 'row-reverse' : 'row',
            }}
          >
            <Avatar
              sx={{
                bgcolor: isUser ? 'primary.main' : 'secondary.main',
                width: 32,
                height: 32,
              }}
            >
              {isUser ? <PersonIcon fontSize="small" /> : <SmartToyIcon fontSize="small" />}
            </Avatar>
            <Paper
              elevation={1}
              sx={{
                p: 2.5,
                maxWidth: isUser ? '70%' : '90%',
                bgcolor: isUser ? 'primary.light' : 'background.paper',
                color: isUser ? 'primary.contrastText' : 'text.primary',
                overflowX: 'auto',
                '& p': { margin: 0, marginBottom: 1, lineHeight: 1.6 },
                '& p:last-child': { marginBottom: 0 },
                // Top-level lists (ol)
                '& > div > ol': {
                  marginTop: 0.5,
                  marginBottom: 0.5,
                  paddingLeft: 2.5,
                  '& > li': {
                    marginBottom: 0.5,
                    paddingLeft: 0.5,
                    '& > strong': {
                      fontSize: '1.05em',
                      color: isUser ? 'inherit' : 'primary.main',
                    },
                  },
                },
                // Nested lists (ul inside li)
                '& ul': {
                  marginTop: 0.25,
                  marginBottom: 0.25,
                  marginLeft: 0,
                  paddingLeft: 2,
                  '& li': {
                    marginBottom: 0.25,
                    lineHeight: 1.5,
                    paddingLeft: 0.5,
                    '& strong': {
                      fontWeight: 600,
                      marginRight: 0.5,
                    },
                  },
                },
                '& strong': { fontWeight: 600 },
                '& code': {
                  bgcolor: 'action.hover',
                  px: 0.5,
                  py: 0.25,
                  borderRadius: 0.5,
                  fontFamily: 'monospace',
                  fontSize: '0.9em',
                },
                '& pre': {
                  bgcolor: 'action.hover',
                  p: 1.5,
                  borderRadius: 1,
                  overflow: 'auto',
                  '& code': { bgcolor: 'transparent', p: 0 },
                },
                '& table': {
                  borderCollapse: 'collapse',
                  width: '100%',
                  marginTop: 1.5,
                  marginBottom: 1.5,
                  fontSize: '0.85em',
                  overflow: 'hidden',
                  borderRadius: 1,
                  tableLayout: 'auto',
                  minWidth: 'max-content',
                  border: '1px solid',
                  borderColor: 'divider',
                },
                '& th': {
                  bgcolor: 'action.hover',
                  fontWeight: 600,
                  textAlign: 'left',
                  p: 1,
                  borderBottom: '2px solid',
                  borderColor: 'divider',
                  fontSize: '0.8em',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  whiteSpace: 'nowrap',
                },
                '& td': {
                  p: 1,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  verticalAlign: 'top',
                },
                '& tbody tr:hover': {
                  bgcolor: 'action.hover',
                  transition: 'background-color 0.2s',
                },
                '& tr:last-child td': {
                  borderBottom: 'none',
                },
              }}
            >
              <Typography
                component="div"
                variant="body1"
                sx={{
                  whiteSpace: 'pre-wrap',
                  '& > *:first-of-type': { marginTop: 0 },
                  '& > *:last-child': { marginBottom: 0 },
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              </Typography>
            </Paper>
          </Box>
        );
      })}

      {isLoading && (
        <Box
          sx={{
            display: 'flex',
            gap: 1.5,
            alignItems: 'flex-start',
            flexDirection: 'row',
          }}
        >
          <Avatar
            sx={{
              bgcolor: 'secondary.main',
              width: 32,
              height: 32,
            }}
          >
            <SmartToyIcon fontSize="small" />
          </Avatar>
          <Paper
            elevation={1}
            sx={{
              p: 2,
              bgcolor: 'background.paper',
              display: 'flex',
              gap: 0.75,
              alignItems: 'center',
              minHeight: 40,
            }}
          >
            {[0, 1, 2].map((i) => (
              <Box
                key={i}
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: 'text.secondary',
                  animation: `${bounce} 1.4s infinite ease-in-out`,
                  animationDelay: `${i * 0.16}s`,
                }}
              />
            ))}
          </Paper>
        </Box>
      )}

      <div ref={messagesEndRef} />
    </Box>
  );
}
