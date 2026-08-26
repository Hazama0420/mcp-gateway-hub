// lib/adapters/github.ts

import { McpServer } from '@modelcontextprotocol/sdk';
import { z } from 'zod';

interface GitHubCredentials {
  token: string;
}

export function registerTools(server: McpServer, credentials: GitHubCredentials) {
  const { token } = credentials;

  // Helper header standar GitHub API
  const defaultHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'MCP-Gateway-Hub-App', // WAJIB ADA untuk GitHub API
  };

  // 1. Tool: list_repos
  server.tool(
    'list_repos',
    'List GitHub repositories for the authenticated user',
    {},
    async () => {
      try {
        const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
          headers: defaultHeaders,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(`GitHub API error (${response.status}): ${errData?.message || response.statusText}`);
        }

        const repos = await response.json();
        const repoList = repos.map((repo: any) => ({
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          default_branch: repo.default_branch,
          url: repo.html_url,
          description: repo.description,
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

  // 2. Tool: list_directory
  server.tool(
    'list_directory',
    'List files and directories at a specific path in a GitHub repository',
    {
      repo: z.string().describe('Repository full name (e.g. "owner/repo")'),
      path: z.string().optional().default('').describe('Folder path (leave empty for root)'),
      ref: z.string().optional().describe('Branch or commit SHA'),
    },
    async ({ repo, path = '', ref }) => {
      try {
        const url = new URL(`https://api.github.com/repos/${repo}/contents/${path}`);
        if (ref) url.searchParams.set('ref', ref);

        const response = await fetch(url.toString(), {
          headers: defaultHeaders,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(`GitHub API error (${response.status}): ${errData?.message || response.statusText}`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error(`Path '${path}' is a file, not a directory. Use get_file_contents instead.`);
        }

        const items = data.map((item: any) => ({
          name: item.name,
          path: item.path,
          type: item.type, // 'file' | 'dir'
          size: item.size,
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify(items, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // 3. Tool: get_file_contents
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
          headers: defaultHeaders,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(`GitHub API error (${response.status}): ${errData?.message || response.statusText}`);
        }

        const data = await response.json();

        let decoded = '';
        if (data.content && data.encoding === 'base64') {
          // Bersihkan whitespace/newline sebelum decode
          const cleanBase64 = data.content.replace(/\s/g, '');
          decoded = Buffer.from(cleanBase64, 'base64').toString('utf-8');
        } else {
          decoded = data.content || '';
        }

        return {
          content: [
            {
              type: 'text',
              text: `File: ${data.name}\nPath: ${data.path}\nSHA: ${data.sha}\nSize: ${data.size} bytes\n\nContent:\n${decoded}`,
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

  // 4. Tool: create_or_update_file (Push Kode/File)
  server.tool(
    'create_or_update_file',
    'Create or update a file in a GitHub repository (commits & pushes directly)',
    {
      repo: z.string().describe('Repository full name (e.g., "owner/repo")'),
      path: z.string().describe('Path to the file to create or update'),
      content: z.string().describe('The plain text content of the file'),
      message: z.string().describe('Commit message'),
      branch: z.string().optional().describe('Branch name (optional, defaults to repo default)'),
      sha: z.string().optional().describe('The blob SHA of the file being replaced (required if updating an existing file)'),
    },
    async ({ repo, path, content, message, branch, sha }) => {
      try {
        // Jika file sudah ada dan sha tidak diberikan, ambil sha terlebih dahulu
        let fileSha = sha;
        if (!fileSha) {
          const checkUrl = new URL(`https://api.github.com/repos/${repo}/contents/${path}`);
          if (branch) checkUrl.searchParams.set('ref', branch);

          const checkRes = await fetch(checkUrl.toString(), { headers: defaultHeaders });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            fileSha = checkData.sha;
          }
        }

        const bodyPayload: any = {
          message,
          content: Buffer.from(content, 'utf-8').toString('base64'),
        };
        if (branch) bodyPayload.branch = branch;
        if (fileSha) bodyPayload.sha = fileSha;

        const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
          method: 'PUT',
          headers: {
            ...defaultHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyPayload),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(`GitHub API error (${response.status}): ${errData?.message || response.statusText}`);
        }

        const result = await response.json();
        return {
          content: [
            {
              type: 'text',
              text: `Success! File '${path}' committed. Commit SHA: ${result.commit.sha}`,
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

  // 5. Tool: create_issue
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
            ...defaultHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title, body }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(`GitHub API error (${response.status}): ${errData?.message || response.statusText}`);
        }

        const issue = await response.json();
        return {
          content: [
            {
              type: 'text',
              text: `Issue created: ${issue.html_url} (#${issue.number})`,
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