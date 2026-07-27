-- Allow private (DM) chats in messenger bot catalog.

alter type public.messenger_chat_kind add value if not exists 'private';
