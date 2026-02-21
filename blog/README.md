# Blog

This is my personal blog, built with Jekyll and deployed to [https://kzagar.github.io/blog/](https://kzagar.github.io/blog/).

## Dependencies

- **Jekyll**: A static site generator written in Ruby.
- **Ruby**: Version 3.3 is used in CI/CD, but it is compatible with recent versions.
- **Bundler**: Used to manage Ruby gem dependencies.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/kzagar/blog.git
    cd blog
    ```

2.  **Install dependencies:**
    ```bash
    bundle install
    ```

## Maintenance

### Running Locally

To preview the blog locally, run:
```bash
bundle exec jekyll serve
```
Then open `http://localhost:4000/blog/` in your browser.

### Adding New Posts

Create a new Markdown file in the `_posts/` directory. The filename must follow the format `YYYY-MM-DD-title.markdown`. Each post should include front matter:

```yaml
---
layout: post
title: "Your Post Title"
date: 2026-02-21 12:00:00 +0100
categories: jekyll update
---
```

### Updating Configuration

Modify `_config.yml` to change the site title, description, or other global settings.

## CI/CD and Deployment

This blog uses GitHub Actions for automated deployment.

- **Workflow**: `.github/workflows/deploy.yml`
- **Trigger**: Every push to the `main` branch.
- **Process**:
  1.  **Build**: The site is built using Jekyll.
  2.  **Artifact**: The generated static files (`_site/`) are uploaded as a build artifact.
  3.  **Deploy**: The workflow clones the `kzagar/kzagar.github.io` repository, updates the `blog/` folder with the new build, and pushes the changes back to the master branch.

**Note**: Cross-repository deployment requires a GitHub App with appropriate permissions, configured via `APP_ID` (variable) and `APP_PRIVATE_KEY` (secret) in the repository settings.
