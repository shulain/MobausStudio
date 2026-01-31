# Skills System

Skills are predefined prompt templates that help you quickly complete specific tasks without writing complex prompts each time.

## What are Skills?

Skill = Preset prompt + Parameter template

For example, a "Code Review" skill might include:

- Preset review criteria
- Output format requirements
- Focus point hints

You just need to provide the code, and the skill will automatically assemble the complete prompt.

---

## Using Skills

### 1. Open Skills Page

Click the "🧩 Skills" icon in the sidebar.

### 2. Select Skill

Browse the available skills list, click to select the skill you want to use.

### 3. Fill Parameters

Fill in required parameters according to skill requirements (such as code, text, etc.).

### 4. Execute

Click "Execute" or "Send", the skill will automatically generate the complete prompt and send to AI.

---

## Built-in Skills

MobausStudio provides 3 built-in skills, ready to use out of the box:

| Skill | Function | Description |
|-------|----------|-------------|
| Code Review | Review code quality, security, performance | Categorizes issues by P0/P1/P2 priority, provides professional review reports |
| Translation Expert | Multi-language translation | Supports Chinese/English/Japanese/Korean, follows faithfulness-expressiveness-elegance principles |
| Writing Assistant | Polish, expand, rewrite articles | Supports business emails, technical docs, marketing copy and more |

> 💡 Built-in skills cannot be edited or deleted, but you can create custom skills to meet more needs.

---

## Skill Parameters

Different skills may require different parameters:

### Required Parameters

Inputs required for skill to run, such as:

- Code review: needs code
- Translation: needs original text and target language

### Optional Parameters

Customizable options, such as:

- Output language
- Detail level
- Specific focus points

---

## Custom Skills

### Create Skill

1. Click the "🧩 Skills" icon in the sidebar to enter skills page
2. Click "Add Skill" button
3. Fill in skill information:
   - Name
   - Description
   - Prompt template
   - Parameter definitions

### Prompt Template Syntax

Use `{{parameter_name}}` as placeholder:

```
Please review the following {{language}} code:

{{code}}

Focus on:
- Code quality
- Security
- {{focus}}
```

### Import/Export

Skills can be exported as JSON files for easy sharing and backup.

---

## Usage Tips

### 1. Combined Use

You can use one skill to process first, then use another skill to optimize the result.

### 2. Adjust Parameters

Adjust optional parameters according to actual needs for more precise results.

### 3. Iterative Optimization

If the result is not satisfactory, you can modify parameters and re-execute, or continue optimizing in conversation.

---

## Next Steps

- [Keyboard Shortcuts](../advanced/shortcuts.md) - Improve efficiency
- [Data Management](../advanced/data-management.md) - Manage your data
