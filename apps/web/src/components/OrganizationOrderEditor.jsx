import React, { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup } from '@/components/ui/command';

export default function OrganizationOrderEditor({ label, options, value = [], onChange }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = [...new Set(value.filter(Boolean))];
  const available = [...new Set(options)].filter(option => !selected.includes(option));
  const move = (index, direction) => {
    const next = [...selected];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next);
  };
  return <section className="min-w-0 space-y-3" aria-label={label}>
    <h4 id={id} className="text-sm font-medium">{label}</h4>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" role="combobox" aria-expanded={open} aria-labelledby={id} disabled={!available.length} className="w-full justify-between">{available.length ? 'Search and add…' : 'All items selected'}</Button></PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command><CommandInput placeholder={`Search ${label.toLowerCase()}…`} /><CommandList><CommandEmpty>No matching options.</CommandEmpty><CommandGroup>
          {available.map(option => <CommandItem key={option} value={option} onSelect={() => { onChange([...selected, option]); setOpen(false); }}>{option}</CommandItem>)}
        </CommandGroup></CommandList></Command>
      </PopoverContent>
    </Popover>
    <p className="text-xs text-muted-foreground">First added is priority 1. Unselected items follow the selected order.</p>
    <ol className="max-h-80 space-y-2 overflow-y-auto" aria-label={`${label} selected priorities`}>
      {selected.map((name, index) => <li key={name} className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{index + 1}</Badge>
        <span className="min-w-0 flex-1 break-words">{name}</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => move(index, -1)}>Up</Button>
          <Button variant="ghost" size="sm" aria-label={`Move ${name} down`} disabled={index === selected.length - 1} onClick={() => move(index, 1)}>Down</Button>
          <Button variant="ghost" size="sm" aria-label={`Remove ${name} from order`} onClick={() => onChange(selected.filter(item => item !== name))}>Remove</Button>
        </div>
      </li>)}
    </ol>
    {!selected.length && <p className="text-sm text-muted-foreground">Choose your first priority above.</p>}
  </section>;
}
