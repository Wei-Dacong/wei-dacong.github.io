---
title: ''
summary: ''
date: 2022-10-24
type: landing

sections:
  - block: resume-biography-3
    id: about
    content:
      username: me
      text: ''
      headings:
        about: 简介
        interests: 研究方向
    design:
      background:
        gradient_mesh:
          enable: false
      name:
        size: sm
      avatar:
        size: small
        shape: circle
      banner:
        filename: ink-hero.svg
  - block: markdown
    id: research
    content:
      title: '研究内容'
      subtitle: ''
      text: |-
        我的研究方向聚焦于**分子模拟与机器学习势能中的方法开发与应用**。
    design:
      columns: '1'
  - block: collection
    id: news
    content:
      title: 动态
      subtitle: ''
      text: ''
      page_type: blog
      count: 5
      filters:
        author: ''
        category: ''
        tag: ''
        exclude_featured: false
        exclude_future: false
        exclude_past: false
        publication_type: ''
      offset: 0
      order: desc
    design:
      view: date-title-summary
      spacing:
        padding: [0, 0, 0, 0]
  - block: collection
    id: papers
    content:
      title: 论文
      text: ''
      filters:
        folders:
          - publications
        exclude_featured: false
    design:
      view: citation
  - block: resume-experience
    id: experience
    content:
      username: me
    design:
      date_format: '2006年1月'
      is_education_first: false
---
