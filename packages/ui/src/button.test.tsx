import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './button';
describe('Button', () => {
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('fires onClick event when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Submit</Button>);
    
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies variant and size classes correctly', () => {
    render(<Button variant="danger" size="lg">Danger</Button>);
    const button = screen.getByRole('button', { name: 'Danger' });
    
    // Check for unique classes from our variant and size definitions
    expect(button.className).toContain('bg-status-danger');
    expect(button.className).toContain('px-6'); // lg size class
  });
});
