# Conexión a Supabase — Login

## Datos del proyecto

| Campo        | Valor                                      |
|--------------|--------------------------------------------|
| URL          | https://xuhxjbsotlkaedkeyeio.supabase.co  |
| Anon Key     | ver `.env.local`                           |
| Schema       | `prosoft_project`                          |
| Tabla perfil | `prosoft_project.profile`                  |

---

## 1. Instalar cliente de Supabase

```bash
npm install @supabase/supabase-js
```

---

## 2. Variables de entorno

Crear `.env.local` en la raíz del proyecto:

```env
VITE_SUPABASE_URL=https://xuhxjbsotlkaedkeyeio.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> **Importante:** nunca subir `.env.local` al repositorio. Agregar al `.gitignore`.

---

## 3. Cliente Supabase

Crear `src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

---

## 4. Tabla `profile` en Supabase

La tabla vive en el schema `prosoft_project`. Estructura mínima esperada:

```sql
create table prosoft_project.profile (
  id        uuid references auth.users on delete cascade,
  name      text,
  role      text,
  created_at timestamptz default now(),
  primary key (id)
);
```

> Habilitar RLS y agregar policy para que el usuario solo lea su propio perfil:
>
> ```sql
> alter table prosoft_project.profile enable row level security;
>
> create policy "Usuario lee su perfil"
>   on prosoft_project.profile
>   for select using (auth.uid() = id);
> ```

---

## 5. Login en `LoginPage.tsx`

Reemplazar `handleSubmit` para usar Supabase Auth:

```ts
import { supabase } from '../lib/supabase'

async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault()
  const form = e.currentTarget
  const email    = (form.elements.namedItem('email')    as HTMLInputElement).value
  const password = (form.elements.namedItem('password') as HTMLInputElement).value

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    alert(error.message)
    return
  }

  navigate('/home')
}
```

Agregar `name` a los inputs para que `form.elements.namedItem` los encuentre:

```tsx
<input name="email"    type="email"    ... />
<input name="password" type="password" ... />
```

---

## 6. Leer perfil del usuario en `HomePage`

Una vez autenticado, obtener nombre y cargo desde `prosoft_project.profile`:

```ts
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const [userName, setUserName] = useState('Usuario')
const [userRole, setUserRole] = useState('Cargo')

useEffect(() => {
  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .schema('prosoft_project')
      .from('profile')
      .select('name, role')
      .eq('id', user.id)
      .single()

    if (data) {
      setUserName(data.name)
      setUserRole(data.role)
    }
  }
  fetchProfile()
}, [])
```

Pasar los valores al componente:

```tsx
<TopBar name={userName} role={userRole} />
```

---

## 7. Cerrar sesión (`Sidebar`)

En el botón "Cerrar Sesión":

```ts
import { supabase } from '../lib/supabase'

async function handleLogout() {
  await supabase.auth.signOut()
  // redirigir al login
}
```

---

## Checklist de implementación

- [ ] `npm install @supabase/supabase-js`
- [ ] Crear `.env.local` con URL y anon key
- [ ] Agregar `.env.local` al `.gitignore`
- [ ] Crear `src/lib/supabase.ts`
- [ ] Crear tabla `prosoft_project.profile` con RLS
- [ ] Actualizar `handleSubmit` en `LoginPage.tsx`
- [ ] Agregar `name` a los inputs de email y password
- [ ] Leer perfil en `HomePage.tsx` y pasarlo a `TopBar`
- [ ] Conectar botón "Cerrar Sesión" en `Sidebar.tsx`
