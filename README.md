## Esmail Shabayek Profile

Built with [Jekyll](https://jekyllrb.com/) and deployed on Cloudflare Pages
(build command `jekyll build`, output directory `_site`).

### Run locally

```sh
bundle install
bundle exec jekyll serve --drafts   # http://localhost:4000
```

### Writing a blog post

1. Create `_posts/YYYY-MM-DD-your-slug.md` (start in `_drafts/` without a date if it's not ready yet).
2. Add front matter:

   ```yaml
   ---
   title: "Post title"
   description: One or two sentences, used on the cards and for search/social previews.
   tags: [Engineering, Leadership]
   image: /images/blog/your-cover.jpg   # optional, 1200x630
   ---
   ```

3. Write the post in Markdown, then commit and push. It shows up on `/blog/`, in the homepage "Latest Posts" section, and in `/feed.xml`.

See `_drafts/sample-post.md` for every supported formatting option.
