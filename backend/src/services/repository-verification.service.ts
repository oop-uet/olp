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

interface GitHubRepositoryInvitationResponse {
  id?: number;
  repository?: {
    full_name?: string;
    name?: string;
    owner?: {
      login?: string;
    };
  };
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
    const tokenUser = await getAuthenticatedGitHubUser(token);
    if (!tokenUser) {
      return {
        error: {
          code: "GITHUB_VERIFICATION_FAILED",
          message: "Token GitHub không hợp lệ hoặc không đủ quyền để kiểm tra repository.",
        },
      };
    }

    let repoResponse = await githubFetch(`/repos/${parsed.owner}/${parsed.repo}`, token);
    if (repoResponse.status === 404) {
      if (tokenUser.toLowerCase() !== requiredCollaborator.toLowerCase()) {
        return {
          error: {
            code: "CONFIGURATION_ERROR",
            message:
              `PROJECT_REPOSITORY_GITHUB_TOKEN phải thuộc tài khoản ${requiredCollaborator} ` +
              "để hệ thống có thể tự động nhận invitation repository.",
          },
        };
      }

      const invitationResult = await acceptPendingRepositoryInvitation(parsed, token, requiredCollaborator);
      if (isRepositoryVerificationError(invitationResult)) return invitationResult;

      repoResponse = await githubFetch(`/repos/${parsed.owner}/${parsed.repo}`, token);
      if (repoResponse.status === 404) {
        return {
          error: {
            code: "REPOSITORY_NOT_ACCESSIBLE",
            message:
              `Đã nhận invitation cho ${requiredCollaborator}, nhưng GitHub vẫn chưa cho phép truy cập repository. ` +
              "Vui lòng thử lưu lại sau ít phút.",
          },
        };
      }
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
        message: `Repository private cần thêm ${requiredCollaborator} làm collaborator trước khi lưu bài nộp.`,
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

async function acceptPendingRepositoryInvitation(
  repository: { owner: string; repo: string },
  token: string,
  requiredCollaborator: string
) {
  const invitation = await findPendingRepositoryInvitation(repository, token);
  if (isRepositoryVerificationError(invitation)) return invitation;
  if (!invitation) {
    return {
      error: {
        code: "COLLABORATOR_REQUIRED",
        message:
          "Không tìm thấy invitation GitHub đang chờ cho repository này. " +
          `Hãy thêm ${requiredCollaborator} làm collaborator rồi bấm Lưu bài nộp lại.`,
      },
    };
  }

  const response = await githubFetch(`/user/repository_invitations/${invitation.id}`, token, {
    method: "PATCH",
  });
  if (response.status === 204 || response.status === 304) {
    return { accepted: true };
  }

  return {
    error: {
      code: "GITHUB_INVITATION_ACCEPT_FAILED",
      message: `GitHub trả về lỗi ${response.status} khi tự động nhận invitation repository. Vui lòng thử lại sau.`,
    },
  };
}

async function findPendingRepositoryInvitation(
  repository: { owner: string; repo: string },
  token: string
) {
  for (let page = 1; page <= 5; page += 1) {
    const response = await githubFetch(`/user/repository_invitations?per_page=100&page=${page}`, token);
    if (!response.ok) {
      return {
        error: {
          code: "GITHUB_INVITATION_LOOKUP_FAILED",
          message: `GitHub trả về lỗi ${response.status} khi kiểm tra invitation repository.`,
        },
      };
    }

    const invitations = (await response.json()) as GitHubRepositoryInvitationResponse[];
    const invitation = invitations.find((item) => repositoryInvitationMatches(item, repository));
    if (invitation?.id !== undefined) return invitation;
    if (invitations.length < 100) return null;
  }

  return null;
}

function repositoryInvitationMatches(
  invitation: GitHubRepositoryInvitationResponse,
  repository: { owner: string; repo: string }
) {
  const expectedFullName = `${repository.owner}/${repository.repo}`.toLowerCase();
  const fullName = invitation.repository?.full_name?.toLowerCase();
  if (fullName === expectedFullName) return true;

  const owner = invitation.repository?.owner?.login?.toLowerCase();
  const repo = invitation.repository?.name?.toLowerCase();
  return owner === repository.owner.toLowerCase() && repo === repository.repo.toLowerCase();
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

async function githubFetch(path: string, token: string, init: RequestInit = {}) {
  return fetch(`${GITHUB_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "uet-oasis-oop-platform",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
    signal: AbortSignal.timeout(8000),
  });
}
