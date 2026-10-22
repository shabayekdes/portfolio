---
title: "Sample post: how a blog post is written"
description: A template that shows every formatting feature the blog supports. Copy it into _posts/ with a date to publish.
tags: [Engineering, Leadership]
# image: /images/blog/my-cover.jpg   # optional cover (card + social preview), 1200x630 works best
---

This is a **draft**. Files in `_drafts/` only show up when you run `bundle exec jekyll serve --drafts`, so it never goes live.

To publish a post, create `_posts/YYYY-MM-DD-your-slug.md` with the same front matter as this file.

## A section heading

Normal paragraphs, [links](https://github.com/shabayekdes), *emphasis* and `inline code`.

- Bullet lists
- work as expected

> Blockquotes are good for pulling out the key idea of a post.

### Code blocks

```php
public function handle(Request $request, Closure $next)
{
    return $next($request);
}
```

| Option | Use it for |
|--------|------------|
| Tables | Comparing approaches |
