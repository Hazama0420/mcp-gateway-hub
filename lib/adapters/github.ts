// lib/adapters/github.ts

import { McpServer } from '@modelcontextprotocol/sdk';
import { z } from 'zod';

interface GitHubCredentials {
  token: string;
}

export function registerTools(server: McpServer, credentials: GitHubCredentials) {
  const { token } = credentials;

  // Tool: list_repos
  server.tool(
    'list_repos',
    'List GitHub repositories for the authenticated user',
    {}, // tidak ada parameter
    async () => {
      try {
        const response = await fetch('https://api.github.com/user/repos', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });
        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
        const repos = await response.json();
        const repoList = repos.map((repo: any) => ({
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          url: repo.html_url,
        }));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(repoList, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: create_issue
  server.tool(
    'create_issue',
    'Create a new issue in a GitHub repository',
    {
      repo: z.string().describe('Repository full name (e.g., "owner/repo")'),
      title: z.string().describe('Issue title'),
      body: z.string().optional().describe('Issue body (optional)'),
    },
    async ({ repo, title, body }) => {
      try {
        const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title, body }),
        });
        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
        const issue = await response.json();
        return {
          content: [
            {
              type: 'text',
              text: `Issue created: ${issue.html_url}\n${JSON.stringify(issue, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: get_file_contents
  server.tool(
    'get_file_contents',
    'Get contents of a file from a GitHub repository',
    {
      repo: z.string().describe('Repository full name (e.g., "owner/repo")'),
      path: z.string().describe('Path to the file in the repository'),
      ref: z.string().optional().describe('Branch, tag, or commit SHA (default: default branch)'),
    },
    async ({ repo, path, ref }) => {
      try {
        const url = new URL(`https://api.github.com/repos/${repo}/contents/${path}`);
        if (ref) url.searchParams.set('ref', ref);
        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });
        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        // Jika file adalah teks, kita decode base64 kontennya
        let content = data.content || '';
        let decoded = '';
        if (content && data.encoding === 'base64') {
          decoded = Buffer.from(content, 'base64').toString('utf-8');
        } else {
          decoded = content;
        }
        return {
          content: [
            {
              type: 'text',
              text: `File: ${data.name}\nPath: ${data.path}\nSize: ${data.size} bytes\nContent:\n${decoded}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}