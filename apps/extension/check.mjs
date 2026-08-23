import assert from "node:assert/strict";
import {
  githubRepoHref,
  isGithubRepoPage,
  parseGithubRepoUrl,
} from "./github-url.js";

assert.deepEqual(parseGithubRepoUrl("https://github.com/mdn/beginner-html-site"), {
  owner: "mdn",
  repo: "beginner-html-site",
});
assert.deepEqual(
  parseGithubRepoUrl("https://github.com/h5bp/html5-boilerplate.git"),
  { owner: "h5bp", repo: "html5-boilerplate" },
);
assert.deepEqual(
  parseGithubRepoUrl("https://github.com/mdn/beginner-html-site/tree/main"),
  { owner: "mdn", repo: "beginner-html-site" },
);
assert.equal(parseGithubRepoUrl("https://github.com/topics/react"), null);
assert.equal(parseGithubRepoUrl("https://github.com/login"), null);
assert.equal(parseGithubRepoUrl("https://gitlab.com/foo/bar"), null);
assert.equal(isGithubRepoPage("https://github.com/mdn/beginner-html-site"), true);
assert.equal(
  isGithubRepoPage("https://github.com/mdn/beginner-html-site/blob/main/index.html"),
  true,
);
assert.equal(
  isGithubRepoPage("https://github.com/mdn/beginner-html-site/settings"),
  false,
);
assert.equal(
  githubRepoHref({ owner: "mdn", repo: "beginner-html-site" }),
  "https://github.com/mdn/beginner-html-site",
);

console.log("ok");
