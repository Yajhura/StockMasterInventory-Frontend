import { Directive, HostListener } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: '[appOnlyNumbers]',
  standalone: true
})
export class OnlyNumbersDirective {
  constructor(private ngControl: NgControl) {}

  @HostListener('input', ['$event.target.value'])
  onInput(value: string) {
    if (!this.ngControl || !this.ngControl.control) return;
    
    // Remove all non-numeric characters
    const sanitized = value.replace(/[^0-9]/g, '');
    
    // Update the control's value if it changed
    if (value !== sanitized) {
      this.ngControl.control.setValue(sanitized, { emitEvent: false });
      // Update the input view
      const valueAccessor = this.ngControl.valueAccessor;
      if (valueAccessor && typeof valueAccessor.writeValue === 'function') {
        valueAccessor.writeValue(sanitized);
      }
    }
  }
}

