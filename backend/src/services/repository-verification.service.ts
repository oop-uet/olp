export interface RepositoryVerificationError {
  error: {
    code: string;
    message: string;
  };
}

interface GitHubRepositoryResponse {
  private?: boolean;
  full_name?: string;
}

interface GitHubUserResponse {
  login?: string;
}

const GITHUB_API_BASE_URL = "https://api.github.com";
const DEFAULT_REQUIRED_COLLABORATOR = "oasis-uet";

export function isRepositoryVerificationError(value: unknown): value is RepositoryVerificationError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as RepositoryVerificationError).error?.code === "string"
  );
}

export async function verifyProjectRepository(repositoryUrl: string) {
  const parsed = parseGitHubRepositoryUrl(repositoryUrl);
  if (isRepositoryVerificationError(parsed)) return parsed;

  const token = process.env.PROJECT_REPOSITORY_GITHUB_TOKEN?.trim();
  const requiredCollaborator =
    process.env.PROJECT_REPOSITORY_REQUIRED_COLLABORATOR?.trim() || DEFAULT_REQUIRED_COLLABORATOR;

  if (!token) {
    return {
      error: {
        code: "CONFIGURATION_ERROR",
        message:
          "Backend chưa cấu hình PROJECT_REPOSITORY_GITHUB_TOKEN để kiểm tra repository private và collaborator oasis-uet.",
      },
    };
  }

  try {
    const repoResponse = await githubFetch(`/repos/${parsed.owner}/${parsed.repo}`, token);
    if (repoResponse.status === 404) {
      return {
        error: {
          code: "REPOSITORY_NOT_ACCESSIBLE",
          message:
            `Không thể truy cập repository bằng tài khoản ${requiredCollaborator}. ` +
            `Hãy để repository ở chế độ private và thêm ${requiredCollaborator} làm collaborator.`,
        },
      };
    }
    if (!repoResponse.ok) {
      return {
        error: {
          code: "GITHUB_VERIFICATION_FAILED",
          message: `GitHub trả về lỗi ${repoResponse.status} khi kiểm tra repository. Vui lòng thử lại sau.`,
        },
      };
    }

    const repoData = await repoResponse.json() as GitHubRepositoryResponse;
    if (repoData.private !== true) {
      return {
        error: {
          code: "REPOSITORY_MUST_BE_PRIVATE",
          message: "Repository BTL phải để private trước khi đăng ký nhóm.",
        },
      };
    }

    const tokenUser = await getAuthenticatedGitHubUser(token);
    if (tokenUser?.toLowerCase() === requiredCollaborator.toLowerCase()) {
      return {
        owner: parsed.owner,
        repo: parsed.repo,
        fullName: repoData.full_name ?? `${parsed.owner}/${parsed.repo}`,
        private: true,
        collaborator: requiredCollaborator,
      };
    }

    const collaboratorResponse = await githubFetch(
      `/repos/${parsed.owner}/${parsed.repo}/collaborators/${requiredCollaborator}`,
      token
    );
    if (collaboratorResponse.status === 204) {
      return {
        owner: parsed.owner,
        repo: parsed.repo,
        fullName: repoData.full_name ?? `${parsed.owner}/${parsed.repo}`,
        private: true,
        collaborator: requiredCollaborator,
      };
    }

    return {
      error: {
        code: "COLLABORATOR_REQUIRED",
        message: `Repository private cần thêm ${requiredCollaborator} làm collaborator trước khi đăng ký nhóm.`,
      },
    };
  } catch {
    return {
      error: {
        code: "GITHUB_VERIFICATION_FAILED",
        message: "Không thể kết nối GitHub để kiểm tra repository. Vui lòng thử lại sau.",
      },
    };
  }
}

function parseGitHubRepositoryUrl(repositoryUrl: string) {
  try {
    const url = new URL(repositoryUrl.trim());
    if (url.hostname.toLowerCase() !== "github.com") {
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: "URL GitHub cần có dạng https://github.com/<owner>/<repo>.",
        },
      };
    }

    const [owner, rawRepo, ...rest] = url.pathname
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!owner || !rawRepo || rest.length > 0) {
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: "URL GitHub cần trỏ trực tiếp tới repository, ví dụ https://github.com/oasis-uet/project.",
        },
      };
    }

    const repo = rawRepo.replace(/\.git$/i, "");
    return { owner, repo };
  } catch {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "URL GitHub không hợp lệ.",
      },
    };
  }
}

async function getAuthenticatedGitHubUser(token: string) {
  const response = await githubFetch("/user", token);
  if (!response.ok) return null;
  const data = await response.json() as GitHubUserResponse;
  return data.login ?? null;
}

async function githubFetch(path: string, token: string) {
  return fetch(`${GITHUB_API_BASE_URL}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "uet-oasis-oop-platform",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(8000),
  });
}
