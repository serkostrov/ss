# Политики RLS (АПСС «Северное сияние»)

Каталог актуален после миграций `20260715000017_rls_hardening.sql` и
`20260715000018_fix_security_definer_helpers.sql`.  
Роли: **admin** (`is_admin()` = `role=admin` и `status` ≠ `blocked`), **member** (`is_confirmed_member()`), **service_role** (worker / бэкенд, обходит RLS).

Хелперы (все `SECURITY DEFINER`, `search_path=public`, **`row_security=off`**, `PUBLIC` EXECUTE отозван):

| Функция | Назначение |
|---------|------------|
| `is_admin()` | Админ (`role=admin`, не `blocked`) |
| `is_confirmed_member()` | Подтверждённый участник с привязкой представителя |
| `current_representative_id()` | ID представителя текущего пользователя |
| `current_company_id()` | ID компании текущего участника |
| `current_company_level_id()` | Уровень участия компании (только active + confirmed member) |
| `member_belongs_to_work_group(id)` | Участник состоит в рабочей группе |
| `member_can_access_material_section(id)` | Опубликованный материал + ACL по уровню компании |
| `member_can_access_poll(id)` | Активный опрос в периоде + ACL по уровню компании |

> **Важно:** без `row_security=off` при `FORCE ROW LEVEL SECURITY` хелперы
> не могут надёжно читать `users` (политики вызывают `is_admin()` снова),
> и admin INSERT/UPDATE падают с нарушением RLS.

На всех таблицах приложения включены `ENABLE ROW LEVEL SECURITY` и `FORCE ROW LEVEL SECURITY`.

---

## 1. Персональные данные

### `users`

| Политика | Команда | Логика |
|----------|---------|--------|
| `users_select_own_or_admin` | SELECT | Своя строка (`id = auth.uid()`) или admin |
| `users_update_admin` | UPDATE | Только admin |
| `users_no_direct_insert` | INSERT | `WITH CHECK (false)` — регистрация через `handle_new_user` / RPC |
| `users_no_direct_delete` | DELETE | `USING (false)` |

**Защита ПДн:** email, телефон, ФИО, статус недоступны другим участникам; эскалация роли через клиент невозможна.

### `companies`

| Политика | Команда | Логика |
|----------|---------|--------|
| `companies_admin_all` | ALL | Admin |
| `companies_select_confirmed_member` | SELECT | Admin или confirmed member и `id = current_company_id()` |

**Защита ПДн:** ИНН, контакты, заметки не видны чужим компаниям.

### `representatives`

| Политика | Команда | Логика |
|----------|---------|--------|
| `representatives_admin_all` | ALL | Admin |
| `representatives_select_own` | SELECT | Admin или `id = current_representative_id()` |

**Защита ПДн:** телефон, email, согласие на ПДн коллег компании недоступны (нет select по company_id).

### `participation_levels`

| Политика | Команда | Логика |
|----------|---------|--------|
| `participation_levels_admin_all` | ALL | Admin |
| `participation_levels_member_read_active` | SELECT | Admin или confirmed member и `is_active = true` |

Скрытые уровни не отдаются участникам.

---

## 2. Материалы (доступ по уровню компании)

Хелпер `member_can_access_material_section`:

1. раздел `is_published = true`;
2. пользователь `role=member`, `status=confirmed`;
3. компания `access_status=active`;
4. `companies.participation_level_id` ∈ `material_section_levels`.

| Таблица | Политика | Команда | Логика |
|--------|----------|---------|--------|
| `material_sections` | `material_sections_admin_all` | ALL | Admin |
| `material_sections` | `material_sections_member_read` | SELECT | Admin или `member_can_access_material_section(id)` |
| `material_section_levels` | `material_section_levels_admin_all` | ALL | Admin |
| `material_section_levels` | `material_section_levels_member_read` | SELECT | Admin или (доступ к разделу **и** `participation_level_id = current_company_level_id()`) |
| `material_documents` | `material_documents_admin_all` | ALL | Admin |
| `material_documents` | `material_documents_member_read` | SELECT | Admin или доступ к разделу |

Неопубликованные / чужой уровень — SELECT пустой (не только UI).

---

## 3. Рабочие группы и мессенджеры

| Таблица | Политика | Команда | Логика |
|--------|----------|---------|--------|
| `work_groups` | `work_groups_admin_all` | ALL | Admin |
| `work_groups` | `work_groups_member_read` | SELECT | Admin или член группы и `status <> 'archived'` |
| `work_group_members` | `work_group_members_admin_all` | ALL | Admin |
| `work_group_members` | `work_group_members_member_read` | SELECT | Admin или только **своя** строка членства |
| `work_group_links` | `work_group_links_admin_all` | ALL | Admin |
| `work_group_links` | `work_group_links_member_read` | SELECT | Admin или член группы |
| `messenger_connections` | `messenger_connections_admin_all` | ALL | Admin |
| `messenger_connections` | `messenger_connections_member_read` | SELECT | Admin или член группы |

---

## 4. Голосования и `poll_votes`

Хелпер `member_can_access_poll`: статус `active`, окно `starts_at`/`ends_at`, уровень компании в `poll_level_access`, confirmed member, компания active.

| Таблица | Политика | Команда | Логика |
|--------|----------|---------|--------|
| `polls` | `polls_admin_all` | ALL | Admin |
| `polls` | `polls_member_read` | SELECT | Admin или `member_can_access_poll(id)` |
| `poll_options` | `poll_options_admin_all` | ALL | Admin |
| `poll_options` | `poll_options_member_read` | SELECT | Admin или доступ к poll |
| `poll_level_access` | `poll_level_access_admin_all` | ALL | Admin |
| `poll_level_access` | `poll_level_access_member_read` | SELECT | Admin или (доступ к poll **и** свой уровень) |
| `poll_votes` | `poll_votes_admin_read` | SELECT | Admin |
| `poll_votes` | `poll_votes_member_read_own` | SELECT | Admin или доступ к poll и (свой голос **или** голос компании при `per_company`) |
| `poll_votes` | `poll_votes_no_direct_write` | INSERT | **`WITH CHECK (false)`** |
| `poll_votes` | `poll_votes_no_update` | UPDATE | **`USING/CHECK (false)`** |
| `poll_votes` | `poll_votes_no_delete` | DELETE | **`USING (false)`** |

Голосование только через RPC `cast_vote` (SECURITY DEFINER) — обходит RLS на INSERT после проверок участника.

---

## 5. Сообщения

| Таблица | Политика | Команда | Логика |
|--------|----------|---------|--------|
| `messages` | `messages_admin_all` | ALL | Admin |
| `messages` | `messages_member_read` | SELECT | Admin или член группы |
| `messages` | `messages_no_member_insert` | INSERT | Только admin (worker — `service_role`) |
| `message_relays` | `message_relays_admin_all` | ALL | Admin |
| `message_relays` | `message_relays_member_read` | SELECT | Admin или член группы сообщения |

---

## 6. Журнал и настройки

| Таблица | Политика | Команда | Логика |
|--------|----------|---------|--------|
| `audit_log` | `audit_log_admin_select` | SELECT | Admin |
| `audit_log` | `audit_log_no_direct_insert` | INSERT | `false` — только `write_audit_log` |
| `audit_log` | `audit_log_no_update` / `…_no_delete` | UPDATE/DELETE | `false` |
| `settings` | `settings_admin_all` | ALL | Admin |

---

## 7. Storage

Бакеты **private**: `material-documents`, `work-group-files`.

| Политика | Бакет | Команда | Логика |
|----------|-------|---------|--------|
| `material_documents_storage_admin_all` | material-documents | ALL | Admin |
| `material_documents_storage_member_read` | material-documents | SELECT | Admin или объект = `material_documents.file_url` и ACL раздела |
| `work_group_files_admin_all` | work-group-files | ALL | Admin |
| `work_group_files_member_read` | work-group-files | SELECT | Admin или объект = `work_group_links.file_url` и членство в группе |

Запись файлов участниками **запрещена** (нет INSERT/UPDATE/DELETE политик для member). Доступ на чтение — через signed URL после проверки SELECT.

---

## 8. RPC (SECURITY DEFINER)

Все перечисленные функции: `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated, service_role`.  
Авторизация внутри тела (кроме `cast_vote` — member path).

| RPC | Кто | Заметки |
|-----|-----|---------|
| `confirm_registration` / `reject_registration` / `set_user_status` | admin | Регистрации и статус |
| `*_participation_level*` / `upsert_representative` / `set_primary_representative` | admin | Справочники |
| `reorder_material_*` / `set_material_section_levels` / `bulk_set_*` | admin | Материалы |
| `bulk_add_work_group_members` / `reorder_work_group_links` | admin | Группы |
| `set_poll_levels` / `replace_poll_options` / `get_poll_results` / `list_poll_votes_admin` | admin | Опросы |
| `cast_vote` | confirmed member | Единственная запись в `poll_votes` |
| `write_audit_log` | admin | Единственная запись в `audit_log` |

Worker-мессенджер должен использовать **service_role** для insert в `messages` / `message_relays`.

---

## 9. Матрица (кратко)

| Ресурс | Member | Admin | Аноним |
|--------|--------|-------|--------|
| Свои ПДн (`users`/rep/company) | SELECT свои | ALL | — |
| Материалы | SELECT по уровню | ALL | — |
| Опросы | SELECT/vote по уровню | ALL | — |
| `poll_votes` напрямую | запрет write | SELECT | — |
| Storage файлы | SELECT по ACL | ALL | — |
| `audit_log` / `settings` | — | SELECT/ALL | — |
| RPC admin | — | EXECUTE | — |
| `cast_vote` | EXECUTE | — | — |
