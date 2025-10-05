---
title: Jekyll Private Posts
tags: [jekyll,private]
--- 

## Use Case

A Jekyll-based static web site could come in two flavors: a public one, and
a private one.

How to build the two web sites?

## The exclude config option

Jekyll provides `exclude` [option](https://jekyllrb.com/docs/configuration/options/) --
a way to list all the files that are to be excluded from content generation.

So, private files could just be added to this array.

## Private posts in a separate folder

To clearly mark files as private, add them to a dedicated folder, e.g.,
`_posts/private`.

## Add the folder to the exclude list

Ensure this folder is listed in the `exclude` config option in `_config.yml`:

```yml
exclude:
  # ...
  - "_posts/private" # PRIVATE ONLY
```

## Private build: outcomment the exclude

Use `sed` to outcomment this line before building the site:

```bash
sed -i '/PRIVATE ONLY/s/^/#/' _config.yml
```

## Public build: ensure the line is not commented line

The reverse is achieved by:

```bash
sed -i '/PRIVATE ONLY/s/^#*//' _config.yml
```

