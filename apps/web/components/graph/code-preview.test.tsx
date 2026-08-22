/**
 * CodePreview component tests — renders with syntax highlighting, line
 * numbers, loading states, and empty/null content states.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CodePreview } from './code-preview';

// Mock the session hook
vi.mock('@/hooks/use-github-session', () => ({
  useGitHubSession: () => ({
    getToken: vi.fn().mockResolvedValue('test-token'),
    session: null,
    loading: false,
  }),
}));

// Mock the API client
const mockGetFileContent = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getFileContent: (...args: unknown[]) => mockGetFileContent(...args),
  },
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>{children}</button>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...(props as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
  ),
  CardHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  CardTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  CardContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

describe('CodePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockGetFileContent.mockReturnValue(new Promise(() => {})); // never resolves
    render(<CodePreview filePath="src/app.ts" />);
    expect(screen.getByText('Loading source…')).toBeDefined();
  });

  it('shows file content with line numbers', async () => {
    mockGetFileContent.mockResolvedValue({
      content: 'function hello() {\n  return "world";\n}',
      language: 'typescript',
    });

    render(<CodePreview filePath="src/app.ts" />);

    await waitFor(() => {
      expect(screen.getByText('hello')).toBeDefined();
    });

    // Should show line numbers
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
  });

  it('shows null content placeholder', async () => {
    mockGetFileContent.mockResolvedValue({
      content: null,
      language: 'typescript',
    });

    render(<CodePreview filePath="src/app.ts" />);

    await waitFor(() => {
      expect(screen.getByText('Source preview unavailable for this file')).toBeDefined();
    });
  });

  it('shows error state', async () => {
    mockGetFileContent.mockRejectedValue(new Error('Network error'));

    render(<CodePreview filePath="src/app.ts" />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeDefined();
    });
  });

  it('displays the file name in the header', async () => {
    mockGetFileContent.mockResolvedValue({
      content: 'const x = 1;',
      language: 'typescript',
    });

    render(<CodePreview filePath="src/components/app.ts" label="MyComponent" />);

    await waitFor(() => {
      expect(screen.getByText('MyComponent')).toBeDefined();
    });
  });

  it('shows language badge', async () => {
    mockGetFileContent.mockResolvedValue({
      content: 'def hello(): pass',
      language: 'python',
    });

    render(<CodePreview filePath="src/app.py" />);

    await waitFor(() => {
      expect(screen.getByText('python')).toBeDefined();
    });
  });

  it('calls getFileContent with the correct path', async () => {
    mockGetFileContent.mockResolvedValue({
      content: '',
      language: 'typescript',
    });

    render(<CodePreview filePath="src/deep/nested/file.ts" />);

    await waitFor(() => {
      expect(mockGetFileContent).toHaveBeenCalledWith('src/deep/nested/file.ts', 'test-token');
    });
  });

  it('renders close button when onClose provided', async () => {
    mockGetFileContent.mockResolvedValue({
      content: 'test',
      language: 'typescript',
    });

    const onClose = vi.fn();
    const { container } = render(<CodePreview filePath="src/app.ts" onClose={onClose} />);

    await waitFor(() => {
      // Close button rendered via lucide X icon in a button
      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});
