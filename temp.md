1. **Commenting**: Comment throughout the code, and use Google-style docstrings when the code is complex.
Example of docstring format with a simple function:
```python
def hello_name(name: str) -> str:
    """
    Returns a greeting for the given name.
    
    Args:
        name: The name to greet.
    
    Returns:
        A greeting for the given name.
    """
    return f"Hello, {name}!"
```

2. **Testing**: Always run tests and linting after major changes. Don't stop early if the test for the code you changed breaks. Instead, keep working until it's functional. 
3. **Type Hints**: Use type hints to make the code more readable and maintainable. 
4. **Bash Interruptions**: If you see a command ends with a KeyboardInterrupt or ^C, it means the script had to be stopped manually and did not succeed. Look into these errors, and run the command in the background if you can so you don't get stuck.
5. **Fail Loudly**: If a command fails, it should fail loudly and provide a clear error message. Don't suppress errors, especially in order to make a test succeed.  
6. **LLM Context Length**: Conversations take context, whcih is a valuable resource for AI agents. Verbose chats and long terminal outputs use up context and can lead to errors. Use `--quiet` options when available: 
    - `pip install --quiet`
    - `npm install --quiet`
    - or similar quiet installation flags to reduce noise.